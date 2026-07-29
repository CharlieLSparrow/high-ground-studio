# Quipsly Audio Workbench Quality Methods

Updated: 2026-07-12

## Current scope

The current Episode 4 gate is the high-quality mastered audio spine, not final episode or shorts approval.

Current human-listen candidate:

`/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/episode4-mastered-audio-spine-v006.wav`

Final episode renders, shorts renders, uploads, publishing receipts, and branch inheritance remain locked until this spine has a human listen result.

## Editor audio truth

The editor-grade truth is not the combined mastered waveform. The truth is:

- Refined Charlie dialogue stem.
- Refined Homer dialogue stem.
- Clip/source audio stem.
- Shared sequence clock and sync offsets.
- Non-destructive mute, duck, cleanup, and repair decisions.
- A mix recipe that renders the combined review/export spine when needed.

The combined spine remains valuable. It is the best human-listen artifact, a practical manual-Premiere handoff file, and eventually the podcast/RSS audio branch. But branch editing, clip weaving, ducking, and timing repair should inherit the separate synced stems so we can adjust Charlie, Homer, and clip audio independently without destructive waveform surgery.

## Why one score is not enough

Podcast audio quality has several overlapping truths:

- Platform compliance: integrated loudness, loudness range, true peak, codec/container readiness, and RSS platform expectations.
- Speaker survival: Charlie and Homer must both remain audible where they are intended to be active.
- Source agreement: the mastered spine should reflect the intended source tracks and not accidentally erase a speaker.
- Transcript agreement: source audio, cleaned stems, and mastered spine should produce consistent transcripts with low missing-speech risk.
- Listening quality: no echo, pumping, over-gating, harsh denoise, clipped laughter, or robotic cadence.
- Edit usefulness: the spine should be useful both to Quipsly and to Premiere as a normal mono/stereo finished audio file.

## Research-backed measurement pillars

### Loudness and true peak

Use ITU-R BS.1770 style loudness and true-peak measurement as the foundation. FFmpeg's `loudnorm` filter implements EBU R128 loudness normalization and supports two-pass file workflows.

Practical target for a single podcast distribution master:

- Stereo podcast master: around -16 LUFS integrated.
- Mono podcast master: around -19 LUFS integrated.
- Streaming/music-platform safety: avoid true peak above -1 dBTP, and consider -2 dBTP if a louder master is ever intentionally made.

### Speech and noise quality

Add non-intrusive speech-quality estimation as a future gate, not the only gate. DNSMOS/P.835-style dimensions are useful because they split speech quality, background quality, and overall quality instead of hiding everything inside one number.

Useful future dimensions:

- SIG: speech quality.
- BAK: background/noise quality.
- OVRL: overall perceived quality.
- Segment-level score spread, because one terrible minute matters more than a good average.

### Transcript and speaker agreement

Generate ASR/diarized evidence for:

- Raw source audio tracks.
- Cleaned per-speaker stems.
- Mastered spine.

Compare:

- Speaker-attributed segment coverage.
- Missing-word clusters.
- Low-confidence spans.
- Segment timing drift.
- Areas where a source speaker is active but the master transcript loses that speaker.

This is not a replacement for listening. It is a guardrail against silent failure.

## Current implemented control-plane truth

The current v006 profile has these control-plane states:

- `audioSpineQualityGateLatestStatus=machine-ready-human-listen-required`
- `audioSpineQualityGateScore=93.7`
- `audioMachineListenSentinelLatestStatus=machine-listen-sentinel-ready-with-review-risks`
- `audioAsrEvidenceAdapterLatestStatus=asr-evidence-reused`
- `audioAsrEvidenceAdapterWhisperAvailable=true`
- `audioAsrEvidenceAdapterTranscriptGeneratedCount=4`
- `audioTranscriptSourceAgreementLatestStatus=proof-window-asr-comparison-ready-with-review-risks`
- `audioTranscriptSourceAgreementEnergyProxyPassed=true`
- `audioTranscriptSourceAgreementSemanticImplemented=false`
- `audioTranscriptSourceAgreementTranscriptFileCount=4`
- `approvalStatus=machine-candidate-needs-human-listen-proof`
- `branchInheritanceReady=false`
- `branchRenderReady=false`

Meaning: v006 is the best current morning-listen candidate. Quipsly now has local Whisper proof-window ASR evidence, a registered source/master comparison layer, and a stable ASR review focus packet for the morning listen; the current comparison finds no hard stop and routes one review-risk window for targeted listening. The spine is not approved for episode/short rendering until Charlie listens and records a pass/fail/needs-proof decision.

Current scope clarification: the active quality gate is the high-quality Episode 4 audio spine, not the final YouTube/podcast/shorts packages. Final episode and shorts quality becomes judgeable only after the approved spine is inherited by the edit branches. The `AUDIO_POST_APPROVAL_BRANCH_RUNWAY_PACKET` exists to prove that runway is prepared, but still locked.

## Stronger next methods

Recommended next upgrades, in order:

1. Create or verify a source-aware refined-stems manifest for Charlie, Homer, and clip/source audio, including sync offsets, cleanup lineage, mute/duck layers, and the mix recipe.
2. Use the proof-window ASR source/master comparison to route targeted listening and scoped v007 repairs only when the human listen confirms a real defect.
3. Expand ASR from proof windows to full-spine chapters only after the proof-window comparison stays precise enough to avoid alert fatigue.
4. Add segment-level loudness/true-peak/LRA windows so average loudness cannot hide a bad section.
5. Add DNSMOS/P.835-style non-intrusive quality estimates for source, stems, and spine.
6. Add a human-listen review board with timestamped issue capture: echo, pumping, noise, clipping, missing Homer, missing Charlie, breath/laugh cut-off, harsh denoise, cadence weirdness.
7. Keep post-approval branch readiness visible before approval, without exposing render commands or changing branch state early.
8. Promote future candidates only when machine gates and human listen-proof agree.

## Rewritten working goal

Make Episode 4 publishable by first approving the current-best audio spine, then rendering final branches from source-aware audio truth.

Acceptance:

1. Keep Episode 4 originals untouched. Work only through copies, sidecars, stems, manifests, recipes, branches, and versioned exports.
2. Treat the mastered audio spine as the current gate. Do not render final episodes or shorts until the current-best spine has human listen proof.
3. Use v006 as the morning-listen candidate unless a stronger v007 is created with clearer evidence.
4. Audio quality must be judged through separate gates: loudness/true peak, speaker survival, source agreement, proof-window ASR, transcript agreement where available, segment risk, and human listen notes.
5. Charlie and Homer must both survive the mix. Muting/noise reduction must happen per source/stem, not as a broad operation that erases one speaker.
6. The approved spine should be useful both inside Quipsly and as a normal file Charlie can drop into Premiere.
7. In the editor, preserve separate refined Charlie, Homer, and clip/source stems synced to the same sequence clock. The combined spine is not the only canonical editing layer.
8. After spine approval, create the best Episode 4 long-form cut and at least five strong shorts. Use the approved audio truth and keep all edits as transparent metadata/branches.
9. If Episode 4 blocks, improve the same audio/edit tooling on Episodes 1-6 without overwriting older exports.
10. Every loop should improve one of: audio quality, evidence clarity, transcript/source agreement, edit quality, shorts quality, review visibility, or agent/human workflow.
11. Do not upload, publish, schedule, or claim publication without explicit approval and a real receipt.

Post-approval runway acceptance:

1. Before Charlie listens, branch renders stay locked and commands stay hidden.
2. The packet must show YouTube long-form, podcast/RSS audio, shorts/social, and extended/reference branch options.
3. Missing inputs must be zero before the packet can say it is ready when human approved.
4. The packet must preserve all safety flags: no approval change, no branch state change, no render, no upload, no publication, no original media mutation.
5. Once Charlie approves the audio spine, refresh the control plane before rendering so the branch executor wakes from current manifest truth, not stale enthusiasm.

## Source notes

- ITU-R BS.1770 defines the loudness and true-peak measurement foundation.
- FFmpeg `loudnorm` provides EBU R128 loudness normalization with two-pass file workflows.
- Spotify's public guidance for music loudness targets -14 LUFS and true peak below -1 dBTP, with -2 dBTP advised for louder masters.
- Apple Podcasts emphasizes keeping spoken content audible and distortion-free, and accepts common podcast media formats through RSS workflows.
- DNSMOS/P.835-style scoring is useful as a non-intrusive speech/noise quality signal, especially because it separates speech, background, and overall quality.
- Speaker diarization and ASR confidence are useful for Quipsly because they expose missing-speaker and missing-speech risks that pure loudness metrics cannot see.

## Source-aware stem manifest

Episode 4 now treats the editor-grade audio truth as separate, sequence-aligned refined stems for Charlie, Homer, and clip/source audio plus a mix recipe. The mastered v006 spine remains the recommended human-listen and Premiere-friendly artifact, but final episode and shorts branches should inherit from the stem manifest so timing, ducking, repair, and clip-weaving decisions stay inspectable and reversible.

The control-plane artifact is generated by `apps/QuipslyStudio/script/audio_workbench_source_aware_stem_manifest.py` and registered as `latestAudioSourceAwareStemManifest` in the Episode 4 baseline manifest. It is evidence-only: it does not approve audio, unlock branches, render, upload, publish, or mutate original media.

## Segment audio map

The next safe Episode 4 quality layer is `apps/QuipslyStudio/script/audio_workbench_segment_loudness_map.py`. It creates a windowed RMS/sample-peak map for the mastered v006 spine and the source-aware Charlie, Homer, and clip/source stems. This is not a full LUFS/true-peak approval engine; it is a fast review router that helps humans and agents find loud, quiet, or unexplained windows without rendering branches or touching originals.

## Fast readback tier

The quick coherence layer is `apps/QuipslyStudio/script/audio_workbench_fast_readback_check.py`. It checks the existing v006 listen package, manifest fields, review artifacts, source-aware stem manifest, segment audio map, locked branch gates, and post-approval render rehearsal/sandbox truth without regenerating slow audio evidence.

Use this when the question is, "Is the current human-listen package still internally coherent and safely locked?" It does not approve audio, unlock branches, render episode files, upload, publish, or mutate original media. The full sequential control-plane refresh remains the deeper regeneration tier; fast readback is the cheap guardrail for catching stale or contradictory packet truth.

## 2026-07-12 source-aware branch render guard

The post-approval render runway now has an explicit source-aware inheritance guard. Fast readback and manifest readback consistency smoke verify that future Episode 4 branch renders inherit the source-aware audio contract before they can be treated as ready: Charlie refined stem, Homer refined stem, clip/source stem, shared sequence clock, and the mix recipe must stay available to the branch path.

This is intentionally stricter than checking that a mastered WAV exists. The mastered v006 spine is still the human-listen, Premiere-friendly, and final-podcast convenience artifact, but it is not enough for editor timing truth. Branch rendering must not collapse into a mastered-spine-only workflow because that would make conversation spacing, clip weaving, J/L-cut timing, and source-specific repair opaque.

Validation checkpoint:

- `audio_workbench_post_approval_render_rehearsal.py` returned `post-approval-render-rehearsal-ready-blocked-as-expected` with `branchCount=3` and `missingInputCount=0`.
- `audio_workbench_fast_readback_check.py` returned `fast-readback-passed-human-listen-still-required` with `checkCount=134`, `hardStopCount=0`, and `warningCount=0`.
- `audio_workbench_manifest_readback_consistency_smoke.py` returned `passed=true`, `failureCount=0`, and `checkCount=1310`.
- Safety flags stayed locked: no approval change, no branch state change, no render, no upload, no publication, and no original media mutation.

Next human gate remains unchanged: Charlie listens to v006 and records pass, fail, or needs-proof. Only then should the branch render executor wake up.

## 2026-07-13 executor-level source-aware render guard

The guarded branch render executor now enforces the source-aware audio contract directly before exposing or running Episode 4 branch render commands. Approval and branch-ready booleans are no longer sufficient by themselves. The executor also requires:

- post-approval branch inheritance of source-aware audio truth,
- source-aware contract status `ready-source-aware-editable`,
- Charlie, Homer, and clip/source stem roles,
- at least three ready stems,
- mastered-spine-only editing/rendering disabled.

This closes the gap between "the rehearsal knows source-aware truth" and "the dangerous render button refuses unsafe truth." It keeps the mastered v006 spine useful as a review/export artifact while preserving source-aware stems as the timing/edit truth for conversation spacing, clip weaving, source-specific repair, and future branch edits.

Validation checkpoint:

- `audio_workbench_approved_branch_render_executor.py` on the real v006 baseline returned `blocked-waiting-for-human-listen` and `Commands exposed: False`.
- `audio_workbench_post_approval_render_rehearsal.py` returned `post-approval-render-rehearsal-ready-blocked-as-expected`, `branchCount=3`, and `missingInputCount=0`.
- `audio_workbench_fast_readback_check.py` returned `fast-readback-passed-human-listen-still-required`, `checkCount=139`, `hardStopCount=0`, and `warningCount=0`.
- `audio_workbench_manifest_readback_consistency_smoke.py` returned `passed=true`, `failureCount=0`, and `checkCount=1315`.
- Full `audio_workbench_sequential_control_plane_refresh.py` passed with `stepCount=100`, `stepFailureCount=0`, and `postCheckFailureCount=0`.

Current manifest truth: the executor is still blocked and command-hidden because human listen is pending, but its source-aware render contract is ready with Charlie, Homer, and clip/source roles. No render, upload, publication, approval change, branch unlock, or original-media mutation happened.

## 2026-07-13 human-listen recorder source-aware gate

The guarded human-listen decision recorder now checks the fast-readback source-aware branch-executor fields before it will record an approval path. This prevents a subtle but dangerous failure mode: Charlie approves the v006 audio spine, the control plane unlocks branches, and a later render path silently collapses back to a mastered-spine-only workflow.

Approval now requires evidence that the future branch executor:

- has a ready source-aware render contract,
- inherits source-aware audio truth,
- reports contract status `ready-source-aware-editable`,
- exposes Charlie, Homer, and clip/source roles,
- keeps mastered-spine-only editing disabled.

This keeps the human approval button honest. A human can approve how the v006 spine sounds, but Quipsly still refuses to turn that approval into branch rendering unless the editable source-aware timing truth is intact.

Validation checkpoint:

- `audio_workbench_human_listen_decision_front_door_smoke.py` returned `passed=true`, `failureCount=0`, and `checkCount=50`.
- The smoke confirmed `RECORD_EPISODE_4_AUDIO_DECISION.command` contains fast-readback preflight and source-aware branch-executor requirements.

## 2026-07-13 Codex listen-decision intake guard

The plain-language Codex adapter is now wired to the same post-listen refresh seam as the official workflow. If Charlie says "Approve v006 audio spine" and records it with human-listen confirmation, the adapter records that decision and then runs `audio_workbench_post_listen_refresh.py` instead of a smaller ad hoc script list.

That matters for quality because branch readiness after approval must be recomputed from source-aware refined stems, source offsets, branch preflight, approved executor safety, and post-listen routing. The mastered v006 spine remains the human listen artifact and Premiere-friendly file, but the branch path still inherits Charlie, Homer, and clip/source refined stems on one sequence clock.

Validation checkpoint:

- Codex listen-decision intake smoke passed with `81` checks and `0` failures.
- Fast readback passed with `212` checks, `0` hard stops, and `0` warnings.
- Manifest readback consistency smoke passed with `1473` checks and `0` failures.
- Full sequential control-plane refresh passed with `104` steps, `0` step failures, and `0` post-check failures.
- Safety flags stayed locked: no approval, branch unlock, final render, shorts render, upload, publication, schedule action, or original-media mutation.

## 2026-07-13 Codex real-record sandbox proof

The audio workbench now has a dedicated danger-room test for the chat-facing approval path: `audio_workbench_codex_listen_decision_record_sandbox_smoke.py`.

It copies the current v006 manifest into a sandbox, seeds the required review/control artifacts, runs the Codex adapter as a real recorded approval with human-listen confirmation, and verifies that the canonical post-listen refresh wakes the source-aware branch path only inside the sandbox.

This keeps the future "Charlie approves from chat" action honest:

- Real v006 stays `machine-candidate-needs-human-listen-proof` until Charlie actually approves it.
- The sandbox must reach branch-ready/render-ready through `source-aware-refined-stems`.
- Render commands must be exposed only in the sandbox rehearsal.
- The real baseline must show no render, upload, publication, or original-media mutation.

Validation checkpoint:

- Codex real-record sandbox smoke passed with `23` checks and `0` failures.
- The sandbox recorded `human-approved-for-branch-inheritance`, ran `audio_workbench_post_listen_refresh.py`, reached branch inheritance ready `true`, branch render ready `true`, exposed sandbox render commands, and preserved `source-aware-refined-stems`.
- The real v006 baseline remained `machine-candidate-needs-human-listen-proof`, branch inheritance `false`, branch render `false`.
- Fast readback passed with `212` checks, `0` hard stops, and `0` warnings.
- Manifest readback consistency smoke passed with `1498` checks and `0` failures.
- Full sequential control-plane refresh passed with `105` steps, `0` step failures, and `0` post-check failures.
- `audio_workbench_fast_readback_check.py` returned `fast-readback-passed-human-listen-still-required`, `checkCount=139`, `hardStopCount=0`, and `warningCount=0`.
- `audio_workbench_manifest_readback_consistency_smoke.py` returned `passed=true`, `failureCount=0`, and `checkCount=1315`.
- The real v006 baseline stayed locked: approval status `machine-candidate-needs-human-listen-proof`, branch inheritance `false`, branch render `false`.
- Safety flags stayed clean: no render, upload, publication, approval change, branch state change, or original media mutation.

Next human gate remains unchanged: Charlie listens to v006 and reports pass, fail, or needs-proof. If it passes, the recorder can capture approval and then the control plane can wake the source-aware branch renderer. If it fails, notes route to scoped v007 proof or repair.

## 2026-07-13 source-aware timing/edit contract

The audio spine now has an explicit source-aware timing contract, not just a source-aware stem manifest. The new contract answers the editor question: can Episode 4 branch edits still adjust conversation spacing, clip weaving, reactions, J/L-cut timing, and source-specific repair while staying tied to video and the shared sequence clock?

Generated artifact:

- `AUDIO_SOURCE_AWARE_TIMING_CONTRACT.json`
- `AUDIO_SOURCE_AWARE_TIMING_CONTRACT.md`
- `AUDIO_SOURCE_AWARE_TIMING_CONTRACT.html`
- `OPEN_AUDIO_SOURCE_AWARE_TIMING_CONTRACT.command`

Contract truth:

- Status: `source-aware-timing-contract-ready-human-listen-gated`
- Ready roles: `3`
- Full-length sequence-aligned stems: `3`
- Required roles: Charlie, Homer, clip/source
- Maximum duration delta to the mastered v006 spine: `0.057s`
- Duration tolerance: `0.25s`
- Hard stops: `0`

Product meaning:

- The mastered v006 spine stays useful for listening, Premiere handoff, and final podcast audio after approval.
- The editable timing truth remains Charlie refined stem, Homer refined stem, clip/source stem, shared sequence clock, and metadata decisions above those stems.
- Branches may move SHOW/SKIP/edit-decision boundaries, duck/mute/keyframe sources, and shape reaction/clip timing without destructively trimming source stems.
- Branches must not fall back to mastered-spine-only editing.

Validation checkpoint:

- `audio_workbench_source_aware_timing_contract.py` returned `source-aware-timing-contract-ready-human-listen-gated`, `sourceAwareTimingReady=true`, `readyRoleCount=3`, `hardStopCount=0`, and max delta `0.057s`.
- `audio_workbench_fast_readback_check.py` returned `fast-readback-passed-human-listen-still-required`, `checkCount=161`, `hardStopCount=0`, and `warningCount=0`.
- `audio_workbench_manifest_readback_consistency_smoke.py` returned `passed=true`, `failureCount=0`, and `checkCount=1354`.
- Safety flags stayed clean: no approval change, branch unlock, render, upload, publication, or original media mutation.

Next human gate remains unchanged: Charlie listens to v006 and records pass, fail, or needs-proof. If it passes, branch rendering can inherit this timing contract instead of guessing how audio and video should move together.

## 2026-07-13 UTC checkpoint - source-aware timing visible in human review path

The Episode 4 v006 human review path now exposes the source-aware timing contract directly in the final-listen mission packet and morning review launcher.

Why this matters: the mastered spine is the audio file Charlie listens to, but the editor must inherit the source-aware timing layer for branch edits. Charlie, Homer, and clip/source refined stems remain full-length on one sequence clock so later timing work can improve conversation spacing, clip weaving, reaction cuts, J/L cuts, and scoped repairs without falling back to flattened-master editing.

Artifacts refreshed in the current v006 baseline folder:

- `AUDIO_SOURCE_AWARE_TIMING_CONTRACT.html`
- `AUDIO_FINAL_LISTEN_MISSION_PACKET.html`
- `EPISODE_4_MORNING_AUDIO_REVIEW.html`
- `AUDIO_FAST_READBACK_CHECK.html`
- `AUDIO_MANIFEST_READBACK_CONSISTENCY_SMOKE.html`

Validation:

- Python compile passed for final-listen mission packet, morning launcher, fast readback, and manifest smoke scripts.
- Source-aware timing contract: `source-aware-timing-contract-ready-human-listen-gated`; ready roles `3`; hard stops `0`; max duration delta to mastered spine `0.057s`.
- Final listen mission packet: `ready-for-final-human-listen-mission`; missing required artifacts `0`; source-aware timing contract included as a required artifact and mission step.
- Fast readback: `fast-readback-passed-human-listen-still-required`; checks `161`; hard stops `0`; warnings `0`.
- Manifest readback smoke: `passed`; checks `1365`; failures `0`.

Safety state remains locked: no approval change, no branch unlock, no final episode render, no shorts render, no upload, no publication, and no original media mutation.

Current gate remains unchanged: Charlie must still listen to the v006 M4A and report pass/fail/needs-proof before Episode 4 branch rendering can unlock.

## 2026-07-13 UTC checkpoint - Codex plain-language listen decision intake stays source-aware

Added and validated a Codex-friendly plain-language decision intake for the Episode 4 v006 audio spine gate. This adapter lets Charlie say things like `Approve v006 audio spine`, `Needs proof at 57:10`, or `Fail, echo at 34:22`, while still routing through the strict human-listen decision recorder.

Product rule preserved:

- The mastered v006 spine is the human listen/export/Premiere convenience artifact.
- The editable truth remains source-aware: Charlie refined stem, Homer refined stem, clip/source stem, shared sequence clock, source offsets, and metadata decisions.
- Approval of the mastered spine does not allow mastered-spine-only branch editing.
- Post-approval branches must inherit the source-aware timing/audio truth before rendering.

Validation checkpoint:

- `audio_workbench_codex_listen_decision_intake.py` dry-ran `Approve v006 audio spine` as `human-approved-for-branch-inheritance` with `recorded=false`.
- Intake preflight passed and reported `sourceAwareTimingContractReady=true`.
- Approved sandbox executor reported `postApprovalApprovedSandboxExecutorSourceAwareRenderContractReady=true`.
- Approved sandbox executor reported `postApprovalApprovedSandboxExecutorInheritsSourceAwareAudioTruth=true`.
- Approved sandbox executor reported `postApprovalApprovedSandboxExecutorMasteredSpineOnlyEditingAllowed=false`.
- Final episode and shorts gates stayed `locked-until-audio-spine-approved`.
- Human-listen decision front-door smoke passed with `54` checks and `0` failures.
- Manifest readback consistency smoke passed with `1365` checks and `0` failures.
- Real v006 state stayed locked: `approvalStatus=machine-candidate-needs-human-listen-proof`, `branchInheritanceReady=false`, and `branchRenderReady=false`.
- Safety flags stayed clean: no render, upload, publication, or original-media mutation.

Current gate remains unchanged: Charlie must still human-listen v006 and report pass, fail, or needs-proof before Episode 4 branch rendering can unlock.

## 2026-07-13 UTC checkpoint - post-approval branches now declare source-aware edit truth

Strengthened the Episode 4 post-approval branch runway packet so the planned YouTube, podcast/RSS, shorts/social, and extended/reference branches no longer describe themselves as simple flattened mastered-spine outputs.

Product rule preserved:

- Each planned branch now declares `sourceAwareEditable=true`.
- Each planned branch names its audio truth as Charlie/Homer/clip-source refined stems plus mix recipe on the shared sequence clock.
- The mastered v006 spine remains a reference, QC, delivery, or podcast convenience artifact after approval, not the only editable source.
- The post-approval runway only calls itself ready when source-aware branch editing is ready, the source-aware timing contract has zero hard stops, at least three refined stems are ready, and mastered-spine-only editing remains forbidden.

Validation checkpoint:

- `audio_workbench_post_approval_branch_runway_packet.py` generated `AUDIO_POST_APPROVAL_BRANCH_RUNWAY_PACKET.*` with status `post-approval-runway-ready-locked-by-human-listen`.
- Planned branches: `4`.
- Source-aware editable branches: `4`.
- Source-aware roles: `charlie`, `clip-source`, `homer`.
- Ready source-aware stems: `3`.
- Source-aware timing hard stops: `0`.
- Mastered-spine-only editing allowed: `false`.
- Fast readback passed with `0` hard stops.
- Manifest readback smoke passed with `1372` checks and `0` failures.
- Full serialized control-plane refresh passed with `101` steps, `0` step failures, and `0` post-check failures.
- Real v006 state stayed locked: `approvalStatus=machine-candidate-needs-human-listen-proof`, `branchInheritanceReady=false`, and `branchRenderReady=false`.
- Safety flags stayed clean: no render, upload, publication, or original-media mutation.

Current gate remains unchanged: Charlie still needs to human-listen v006 and report pass, fail, or needs-proof before Episode 4 branch rendering can unlock.

## 2026-07-13 source-aware branch render contract hardening

Branch rendering now treats the source-aware audio contract as an enforcement point, not a note. `episode4_full_sync_export.py` exposes the selected refined stems for `charlie`, `homer`, and `clip-source`, and approved branch renders build their temporary branch mix from those aligned stems instead of using the mastered v006 WAV as the only audio source. The mastered spine remains a review/export/Premiere/final-podcast convenience artifact; it is not the editable branch truth.

Validation run:

- `python3 -m py_compile apps/QuipslyStudio/script/episode4_full_sync_export.py apps/QuipslyStudio/script/audio_workbench_branch_qc.py apps/QuipslyStudio/script/audio_workbench_branch_render_evidence.py apps/QuipslyStudio/script/audio_workbench_approved_branch_render_executor.py`
- `episode4_full_sync_export.py --branch main-45-60 --conformed-baseline-dir <v006-baseline> --dry-run` stayed blocked by human listen, while proving the source-aware contract is ready with 3 selected stems.
- `audio_workbench_approved_branch_render_executor.py --baseline-dir <v006-baseline>` stayed `blocked-waiting-for-human-listen`, with source-aware contract ready, role ids `charlie`, `homer`, `clip-source`, ready stem count `3`, and commands not exposed.
- `audio_workbench_manifest_readback_consistency_smoke.py --baseline-dir <v006-baseline>` passed with `1372` checks and `0` failures after executor writeback.
- `audio_workbench_fast_readback_check.py --baseline-dir <v006-baseline>` passed with `0` hard stops and `0` warnings.

Safety truth: no branch render, upload, publication, original-media mutation, or human approval state change was performed. Episode/short rendering remains locked until Charlie records the guarded v006 human-listen decision.

## 2026-07-13 source-aware render regression guard

The approved branch render executor and fast readback now carry explicit anti-regression fields so future work cannot silently collapse Episode 4 branch rendering back to a flattened mastered-WAV-only model.

Executor/readback truth:

- `branchRenderAudioTruth=source-aware-refined-stems`
- `sourceAwareBranchRenderWillUseRefinedStems=true`
- `masteredSpineOnlyBranchRenderPrevented=true`
- `masteredSpineOnlyEditingAllowed=false`
- `status=blocked-waiting-for-human-listen`
- `commandsExposed=false`
- `renderAttempted=false`

Validation run:

- `python3 -m py_compile apps/QuipslyStudio/script/audio_workbench_approved_branch_render_executor.py apps/QuipslyStudio/script/audio_workbench_fast_readback_check.py apps/QuipslyStudio/script/audio_workbench_manifest_readback_consistency_smoke.py`
- `audio_workbench_approved_branch_render_executor.py --baseline-dir <v006-baseline>` regenerated the executor with source-aware refined-stem truth and no exposed render commands.
- `audio_workbench_fast_readback_check.py --baseline-dir <v006-baseline>` passed with `0` hard stops and `0` warnings and echoed the source-aware branch render contract.
- `audio_workbench_manifest_readback_consistency_smoke.py --baseline-dir <v006-baseline>` passed with `1376` checks and `0` failures.

Safety truth: no branch render, upload, publication, original-media mutation, or approval state change was performed. The human-listen gate remains the lock before Episode 4 branch rendering.

## 2026-07-13 source-aware approval gate hardening

Human listen approval now unlocks the source-aware branch gate, not branches directly.

What changed:

- `audio_workbench_record_listen_decision.py` records approval/failure/needs-proof but always leaves `branchInheritanceReady=false` and `branchRenderReady=false` until downstream gates refresh.
- `audio_workbench_branch_gate.py` now enforces the source-aware branch contract: Charlie, Homer, and clip-source refined stems; ready timing contract; zero timing hard stops; post-approval source-aware inheritance; and `masteredSpineOnlyEditingAllowed=false`.
- `audio_workbench_fast_readback_check.py` now verifies that the branch gate proves source-aware refined-stem readiness even while the real branch remains locked behind human listen proof.
- `audio_workbench_approval_path_smoke.py` now rehearses the post-approval path in a sandbox and requires the sandbox executor to expose branch commands only with `branchRenderAudioTruth=source-aware-refined-stems`.

Validation run:

- `python3 -m py_compile` passed for the listen recorder, branch gate, fast readback, approval-path smoke, and approved branch render executor.
- `audio_workbench_branch_gate.py --baseline-dir <v006-baseline>` regenerated the gate with `status=blocked-waiting-for-human-listen-proof` while carrying source-aware contract proof.
- `audio_workbench_approval_path_smoke.py --baseline-dir <v006-baseline>` passed; real manifest approval and branch state were preserved.
- `audio_workbench_approved_branch_render_executor.py --baseline-dir <v006-baseline>` stayed `blocked-waiting-for-human-listen`, with commands hidden.
- `audio_workbench_fast_readback_check.py --baseline-dir <v006-baseline>` passed with `175` checks, `0` hard stops, and `0` warnings.
- `audio_workbench_manifest_readback_consistency_smoke.py --baseline-dir <v006-baseline>` passed with `1376` checks and `0` failures.

Safety truth: no final episode render, shorts render, upload, publication, original-media mutation, or real human approval state change was performed. The current real gate remains Charlie's v006 human listen decision.

## 2026-07-13 source-aware approval language cleanup

Cleaned up the human-facing Episode 4 approval path so the UI/commands/docs no longer imply that a human listen approval directly unlocks branch renders.

Updated surfaces:

- `audio_workbench_human_listen_decision_front_door.py` now describes approval as permission for source-aware branch-gate review, not direct render readiness.
- `audio_workbench_morning_audio_review_launcher.py` now tells reviewers that v006 approval sends the spine into the source-aware branch gate and preflight before rendering.
- `audio_workbench_post_listen_outcome_router.py` now labels the pass route as approval plus source-aware gate refresh, and only exposes branch renders after approval, branch gate, and preflight are all true.
- `docs/quipsly/active-goal-episode-4-audio-to-publication.md` now states that approved audio authorizes the source-aware branch gate; rendering unlocks only after refined-stem/timing proof and render preflight pass.

Regenerated artifacts in the v006 baseline folder:

- `HUMAN_LISTEN_DECISION_FRONT_DOOR.html/json/md`
- `EPISODE_4_MORNING_AUDIO_REVIEW.html/json/md`
- `audio-post-listen-outcome-router-v006-candidate-homer-preserving-clean-20260713-041204.*`
- `AUDIO_FAST_READBACK_CHECK.*`
- `AUDIO_MANIFEST_READBACK_CONSISTENCY_SMOKE.*`

Validation:

- Python compile passed for the human listen decision front door, morning audio review launcher, post-listen outcome router, and fast readback scripts.
- Human decision front door regenerated with `status=ready-for-human-listen-decision`, missing required artifacts `0`, approval state changed `false`, branch state changed `false`, render attempted `false`.
- Morning audio review launcher regenerated without approval, render, upload, publication, or source mutation.
- Post-listen outcome router regenerated with `routeStatus=waiting-for-human-listen`, approval state preserved `true`, real branch render commands exposed `false`.
- Fast readback passed with `175` checks, `0` hard stops, and `0` warnings.
- Manifest readback smoke passed with `1376` checks and `0` failures.

Safety truth: no real human approval, branch unlock, branch render, upload, publication, schedule action, or original-media mutation occurred. Current gate remains Charlie's v006 human listen decision.

## 2026-07-13 post-listen router stale-readiness guard

Added a state-machine guard to the post-listen outcome router so approval cannot bypass source-aware branch readiness.

Quality implication:

- The mastered v006 WAV/M4A remains a listening and handoff artifact.
- The editable/renderable branch truth remains Charlie, Homer, and clip/source refined stems on the shared sequence clock.
- A stale `branchRenderReady=true` flag is insufficient unless source-aware stem/timing proof is also present.
- The fast readback now checks the router itself, including source-aware gate readiness, source-aware branch audio truth, flat-master-only editing prohibition, and no branch render command exposure before human listen.

Validation run:

- `python3 -m py_compile apps/QuipslyStudio/script/audio_workbench_post_listen_outcome_router.py apps/QuipslyStudio/script/audio_workbench_post_listen_outcome_router_smoke.py apps/QuipslyStudio/script/audio_workbench_fast_readback_check.py apps/QuipslyStudio/script/audio_workbench_manifest_readback_consistency_smoke.py`
- `audio_workbench_post_listen_outcome_router.py --baseline-dir <v006-baseline>` regenerated the router with `waiting-for-human-listen` and no render commands.
- `audio_workbench_post_listen_outcome_router_smoke.py --baseline-dir <v006-baseline>` passed, including the stale-flat-render-ready blocked scenario.
- `audio_workbench_fast_readback_check.py --baseline-dir <v006-baseline>` passed with `196` checks, `0` hard stops, and `0` warnings.
- `audio_workbench_manifest_readback_consistency_smoke.py --baseline-dir <v006-baseline>` passed with `1376` checks and `0` failures.

## 2026-07-13 branch preflight command-exposure guard

The branch-render preflight now acts like a gate, not just a dashboard.

Quality implication:

- Seeing a future render command shape is not the same as being allowed to render.
- While the v006 audio spine is waiting on human listen proof, `BRANCH_RENDER_PREFLIGHT.*` hides the real render command and reports `realBranchRenderCommandsExposed=false`.
- The preflight still proves that source-aware branch audio is the intended substrate: Charlie/Homer/clip-source refined stems plus source-aware timing, not the flattened mastered WAV.
- Fast readback and manifest consistency now check branch preflight state directly.

Validation run:

- `python3 -m py_compile apps/QuipslyStudio/script/audio_workbench_branch_render_preflight.py apps/QuipslyStudio/script/audio_workbench_fast_readback_check.py apps/QuipslyStudio/script/audio_workbench_manifest_readback_consistency_smoke.py`
- `audio_workbench_branch_render_preflight.py --baseline-dir <v006-baseline>` regenerated preflight artifacts.
- `audio_workbench_fast_readback_check.py --baseline-dir <v006-baseline>` passed with `212` checks, `0` hard stops, and `0` warnings.
- `audio_workbench_manifest_readback_consistency_smoke.py --baseline-dir <v006-baseline>` passed with `1403` checks and `0` failures.

## 2026-07-13 post-listen refresh control seam

New tool: `apps/QuipslyStudio/script/audio_workbench_post_listen_refresh.py`.

Quality rationale:

- Human listen approval should not depend on someone remembering several downstream scripts.
- The recorder remains a decision ledger; the refresh script is the deterministic control-plane recompute.
- The refresh script verifies source-aware branch truth, flat-master prohibition, branch preflight state, executor state, and router state.
- It writes stable reports without rendering final episode branches, uploading, publishing, or mutating original media.

Router impact:

- Passing v006 now records approval and then runs `audio_workbench_post_listen_refresh.py`.
- Failing v006 records failure and then runs the same refresh so the router can expose the repair path.
- Stale `branchRenderReady=true` still cannot expose real branch commands unless source-aware branch truth also proves ready.

Validation after adding the post-listen refresh seam:

- Python compile passed for `audio_workbench_post_listen_refresh.py`, `audio_workbench_record_listen_decision.py`, `audio_workbench_post_listen_outcome_router.py`, `audio_workbench_post_listen_outcome_router_smoke.py`, and `audio_workbench_manifest_readback_consistency_smoke.py`.
- `audio_workbench_post_listen_refresh.py --baseline-dir <v006-baseline>` wrote `POST_LISTEN_REFRESH.*` with `status=post-listen-refresh-waiting-for-human-listen`, `stepFailureCount=0`, `hardStopCount=0`, and `warningCount=0`.
- Router smoke passed after command families were updated to use the refresh seam.
- Fast readback passed with `212` checks, `0` hard stops, and `0` warnings.
- Manifest readback smoke passed with `1420` checks and `0` failures.

Safety truth: the refresh seam did not approve, render, upload, publish, schedule, mutate original media, or expose real branch render commands while v006 remains waiting on human listen.

Human-facing surface validation after adding the refresh seam:

- Regenerated human listen decision front door, listen decision matrix, marker review notes inbox, review handoff index, and stable START_HERE page.
- All regenerated surfaces preserved approval state and branch state, and did not render or mutate media.
- Refresh remained pre-approval safe: `post-listen-refresh-waiting-for-human-listen`, `stepFailureCount=0`, `hardStopCount=0`, `warningCount=0`.
- Fast readback and manifest smoke remained green after regeneration.

## 2026-07-13 direct recorder source-aware approval preflight

The guarded listen-decision recorder now enforces source-aware branch safety directly. The generated `RECORD_EPISODE_4_AUDIO_DECISION.command` was already checking fast-readback truth, but the underlying Python recorder now checks it too before recording any approval status.

This matters because approval of the mastered v006 listening spine is only a human quality judgement. It is not permission to collapse edit branches into a flattened mastered WAV. The recorder now refuses approval unless the fast readback proves:

- the listen package passes with zero hard stops,
- final episode and shorts gates remain locked before approval,
- Charlie, Homer, and clip/source refined stems are resolved,
- source-aware timing is ready with full-length role stems,
- post-approval rehearsal inherits source-aware audio truth,
- the approved sandbox executor has a ready source-aware render contract,
- the executor sees all required roles,
- mastered-spine-only editing is disabled,
- no render, upload, publication, or original-media mutation flags changed.

Dry-run approval is still non-mutating and reports `sourceAwareApprovalPreflightPassed=true` when the current package is safe. Real approval regenerates fast readback first so stale source-aware evidence cannot be used.

Validation on the current Episode 4 v006 baseline passed: dry-run approval preflight passed, fast readback passed with 212 checks and 0 hard stops, and manifest readback smoke passed with 1420 checks and 0 failures.

## 2026-07-13 reviewer-notes bridge shares the source-aware approval invariant

Approval paths must be boringly consistent. The direct recorder was hardened first, then the imported reviewer-notes bridge was updated so a browser-exported notes packet cannot become a shortcut around source-aware branch safety.

The imported-notes bridge now:

- runs `validate_source_aware_approval_preflight` for approval statuses,
- includes preflight status/pass fields in dry-run output,
- records the preflight evidence into decision JSON/Markdown,
- keeps branch inheritance and branch rendering locked after approval,
- marks branch readiness as requiring the source-aware post-listen refresh,
- preserves the rule that branch rendering uses `source-aware-refined-stems`, not the mastered spine alone.

The smoke suite now checks both normal reviewer notes and marker-review notes for the new preflight fields. This is the useful kind of redundancy: different UX paths, one approval invariant.

Validation on the current Episode 4 v006 baseline passed: reviewer-notes decision bridge smoke passed, marker-review notes inbox smoke passed, fast readback passed with 212 checks and 0 hard stops, and manifest readback smoke passed with 1420 checks and 0 failures.

## 2026-07-13 human approval preflight uses source-aware fast readback

The human approval preflight now treats source-aware branch safety as a first-class requirement. It no longer checks only whether the review package exists and the audio gate is locked. It also requires the fast-readback package to prove that post-approval work can inherit Charlie, Homer, and clip/source refined stems on one timing contract, and that mastered-spine-only editing remains forbidden.

This keeps the human-facing decision surface aligned with the code path: Charlie may approve the v006 audio spine as a listening artifact, but Quipsly must still prove source-aware branch inheritance before final episode or shorts rendering.

The approval-path sandbox smoke was also hardened. It now seeds copied JSON/HTML/Markdown evidence and symlinked large media into the sandbox before recording a sandbox-only approval. Copies are used for regenerated stable evidence files so the sandbox cannot accidentally write through a symlink into the real v006 baseline.

Validation on the current Episode 4 v006 baseline passed: human approval preflight regenerated successfully, approval-path smoke passed with real manifest approval preserved, fast readback passed with 212 checks and 0 hard stops, and manifest readback smoke passed with 1420 checks and 0 failures.

## 2026-07-13 human approval preflight readback contract

The human approval preflight is now a promoted manifest contract, not just a generated review page. This gives agents and UI surfaces a stable way to ask whether the v006 listen-decision path is safe without scraping report internals.

Promoted truth includes: preflight status, ready-for-human-decision, branch locks, fast-readback status, source-aware timing readiness, approved-sandbox source-aware render readiness, flat-master editing prohibition, and non-mutating guardrails. The manifest readback smoke now verifies those fields against `HUMAN_APPROVAL_PREFLIGHT.json`.

The serialized control-plane refresh also regenerates the human approval preflight after fast readback. That sequencing matters: the preflight should depend on current fast-readback source-aware evidence, not stale packet truth.

Validation on the current Episode 4 v006 baseline passed: manifest readback smoke reported 1449 checks and 0 failures, approval-path smoke preserved the real manifest approval state, fast readback reported 212 checks and 0 hard stops, and the full control-plane refresh reported 103 steps with 0 step failures and 0 post-check failures.

## 2026-07-13 UTC checkpoint - Codex intake smoke proves source-aware approval rehearsal

Added a dedicated smoke for the plain-language Codex listen-decision adapter: `apps/QuipslyStudio/script/audio_workbench_codex_listen_decision_intake_smoke.py`.

Why it matters:

- Charlie can say `Approve v006 audio spine`, `Needs proof around 57:10`, or `Fail, echo at 34:22` without bypassing the guarded audio workflow.
- Approval dry-runs now have a safe rehearsal lane: they pass `--confirm-human-listened` only to the dry-run recorder so the source-aware approval preflight can be tested without recording a real approval.
- Real recording still requires explicit `--record --confirm-human-listened`.
- Ambiguous phrases like `Approve ... but needs proof` are refused.
- The real v006 manifest remains locked after the smoke: approval status still waits for human listen, branch inheritance/render remain false, branch audio truth remains `source-aware-refined-stems`, and mastered-spine-only editing remains disabled.

Validation checkpoint:

- `audio_workbench_codex_listen_decision_intake_smoke.py` passed with `72` checks and `0` failures.
- Approval dry-run proved `sourceAwareApprovalPreflightStatus=source-aware-approval-preflight-passed`.
- Needs-proof and fail dry-runs routed as non-approval decisions.
- Safety flags stayed clean: no render, upload, publication, or original-media mutation.

Additional readback after the Codex intake smoke:

- Fast readback passed with `212` checks, `0` hard stops, and `0` warnings.
- Human-listen decision front-door smoke passed with `54` checks and `0` failures.
- Manifest readback consistency smoke passed with `1449` checks and `0` failures.
- Real v006 state remains locked until Charlie records a real human listen result.

## 2026-07-13 serialized Codex intake readback contract

The Codex plain-language listen-decision smoke is now part of the serialized Episode 4 audio control plane, not just a manually-run proof.

- Sequential refresh runs `audio_workbench_codex_listen_decision_intake_smoke.py` after the human-listen front-door smoke.
- Sequential refresh post-checks require the smoke artifact, passing status, zero failures, and non-mutating safety fields.
- Manifest readback independently verifies the smoke report against promoted manifest aliases and current branch truth.

Validation on the current Episode 4 v006 baseline passed: Codex intake smoke `72` checks / `0` failures, manifest readback smoke `1473` checks / `0` failures, full serialized control-plane refresh `104` steps / `0` step failures / `0` post-check failures, and fast readback `212` checks / `0` hard stops / `0` warnings.

This keeps the human-friendly phrase `Approve v006 audio spine` safe: it can rehearse approval as a dry-run, but real approval remains human-listen-gated and still routes to source-aware branch inheritance rather than flat mastered-spine editing.

## 2026-07-13 listen decision command center

Added `audio_workbench_listen_decision_command_center.py` as the smallest calm cockpit for the v006 human decision moment.

The command center is deliberately narrower than the producer command center:

- It names one file to judge: `episode4-mastered-audio-spine-v006.m4a`.
- It gives the exact human phrases and CLI routes for pass, needs-proof, and fail.
- It repeats the critical branch invariant: the mastered spine is a listen/Premiere/delivery convenience artifact; branch editing/rendering inherits source-aware refined stems.
- It shows whether fast readback, source-aware timing, post-approval rehearsal, and the Codex record sandbox proof are all ready.
- It records non-mutating safety fields so manifest readback can prove this artifact did not approve, unlock, render, upload, publish, or mutate originals.

The command center is now part of the serialized control plane and manifest readback smoke. Current validation on the Episode 4 v006 baseline passed: direct command-center generation had `0` missing required artifacts, fast readback had `212` checks with `0` hard stops and `0` warnings, manifest readback had `1549` checks with `0` failures, and full serialized refresh had `106` steps with `0` step failures and `0` post-check failures.

## 2026-07-13 branch renderer dry-run quality visibility

The branch renderer dry-run now exposes enough edit structure to support real quality review before final rendering:

- Source-aware audio plan: branch audio truth, refined stem rows, missing role checks, and flat-master prohibition.
- Per-branch source chunks: chunk count, source role seconds, blank-gap seconds, reference-clip seconds, and whole-source chunking rule.
- Non-mutating truth: dry-run renders no media, changes no approval state, and keeps originals untouched.

This closes a practical QA gap. A branch recipe can now be inspected as a whole-source edit plan before rendering, which makes timing-flow review possible: where the episode cuts to Charlie, Homer, the reference clip, or blank gaps; where conversation spacing may need adjustment; and whether the renderer is still prepared to use source-aware refined stems after approval.

Current proof dry-run on Episode 4 v006 produced `source-aware-refined-stems`, `missingInputs=0`, and no mastered-spine-only branch audio. The current branches expose `103`, `134`, and `176` source chunks respectively for tight, main, and extended cuts.
