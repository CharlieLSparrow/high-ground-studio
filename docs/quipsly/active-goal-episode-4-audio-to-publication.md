# Active goal: Episode 4 professional producer/editor loop

Make Episode 4 the proof that Quipsly can take messy multi-source podcast recordings through sync, source-aware audio mastering, editorial shaping, shorts extraction, and publishable packaging while also making the human/agent editor easier and calmer every cycle.

Active product surfaces:

- `apps/QuipslyStudio`
- Episode 4 `Sync.prproj` as reference evidence, source media, conformed audio baseline, source-aware refined stems, and optional v006+ reference/final mix candidates
- Native Studio editor UI plus generated audio workbench artifacts only where they help the editor
- External-drive review/export folders

Product correction:

Approval and review paperwork are not the product. Use gates only where they prevent original-media mutation, stale source truth, false publication claims, irreversible external actions, or unsafe branch renders. Clarity must live inside the editor as good UI: waveform, meters, transcript, monitor wall, stem/source cards, branch baselines, timeline decisions, playback controls, comparison tools, and obvious next actions.

Primary rule:

Episode 4 quality comes first. Codex is responsible as producer/editor/builder, not just toolsmith. Charlie is a spectator and feedback source for now, not the blocking approver. If Charlie notices a problem, route it into a scoped repair. Otherwise Codex should use source evidence, machine checks, listening tools, transcript/context, and versioned exports to make professional decisions. Explicit human approval is still required before public publishing, external uploads, account mutation, or destructive source changes.

Core work:

1. Provide an obvious in-editor Audio Workbench where Charlie, Homer, and clip/source refined stems are visible, playable, equal-length, sequence-aligned, and supported by loudness/waveform context, transcript context, and useful proof windows. If someone asks "where do I listen?", the answer should be "the Audio tab in Studio," not a file path or form.
2. Keep the source-aware audio model: sync layer -> cleanup/refinement layer with separate polished stems -> branch edit layer -> episode/short exports -> optional final mixdown. The canonical editing truth is the separate stems on one clock. A mastered WAV/M4A mixdown is a reference, proof, manual handoff, or final-delivery artifact, not the spine we edit from.
   Stem-first correction: if future work says "spine," read it as the synchronized source-aware session: aligned media, polished stems, clip audio, transcript, and decision metadata. Do not let it drift back into meaning one flattened mastered podcast file. Export aligned polished stems for Premiere, Final Cut, Descript, Riverside, Quipsly Studio, and future tools by default. Export a flattened mix only when the destination explicitly needs one for listening, publishing, or delivery.
3. Make the editor feel like a professional creative tool that someone coming from Riverside, Descript, Premiere, Final Cut, ElevenLabs, or similar tools can understand quickly while still preserving Quipsly's invention: whole sources stay intact and decisions live as transparent metadata.
4. Create the best Episode 4 long-form cut possible and useful shorts candidates. Pick, shape, master, render, evaluate, and iterate as a producer, not as a clerk waiting for approval.
5. Use branching baselines for sync truth, audio-master truth, long-form edit options, shorts options, and alternatives so complexity stays navigable instead of becoming one giant timeline monster.
6. Surface transparency as editor affordances, not bureaucracy: source cards, meters, waveform, sync badges, branch badges, source-aware render warnings, and quick comparisons beat forms and long packets.
7. Improve QuipslyStudio UX whenever the work feels confusing, ugly, slow, or anxiety-producing. Do not preserve bad UI just because it already exists.
8. Keep all source media non-destructive: preserve originals, use derived stems, proxies, sidecars, manifests, branch recipes, versioned exports, and receipts.
9. Do not publicly publish, upload, schedule, send, mutate accounts, or overwrite originals without Charlie's explicit approval for that exact action.
10. Every run should improve at least one of: editor usability, audio quality, episode quality, shorts quality, source-aware truth, agent ability to produce, human ability to understand, or publish-ready output.

Acceptance:

- v006+ has an obvious native Studio listening path with separate refined Charlie, Homer, and clip/source stems visible, playable, and understandable; any flat mix is secondary.
- The editor lets a human or agent play, scrub, listen, watch, compare, and understand source-aware state without opening a maze of docs.
- Codex can make producer/editor decisions from the tooling instead of needing Charlie to approve every step.
- Episode 4 has current-best long-form and shorts candidates with versioned manifests and honest readiness.
- Branches preserve source-aware refined stems and timing truth; branch renders never silently fall back to flattened mastered-spine-only editing.
- Approval artifacts exist only as safety receipts and external-publication protection, not as the primary workflow.
- Every improvement reduces systems anxiety or improves real content output.

## 2026-07-13 checkpoint - stem-first audio truth pinned into Studio

Quipsly's editable audio truth is now explicitly stem-first. A flattened mastered WAV/M4A is an output artifact only: useful for quick listening, final delivery, or one-off handoff, but not the canonical spine for editing.

Implemented the first native Studio Audio workbench surface:

- Added a left-workbench Audio mode.
- Added `SourceAwareAudioWorkbenchPanel` to show Charlie, Homer, and clip/source refined stems as the primary editable truth.
- The panel reads the current Episode 4 source-aware workbench JSON and segment loudness map.
- It surfaces stem summaries, waveform-style loudness strips, review windows, source paths, and secondary reference-mix playback.
- It intentionally frames the mix as "reference mix," not "editing spine."

Validation:

- Regenerated the QuipslyStudio Xcode project with `xcodegen generate`.
- Built successfully through Xcode project build.
- Launched and verified through `./script/build_and_run.sh --verify`.
- Agent bridge health returned `status=ok` on port `8080`.
- Running app state reports active session `episode-4-sync-baseline-v3-transcript-anchored`.

Next target:

- Make the Audio workbench more like a professional editor surface: richer per-stem waveforms, timeline-synced scrubbing, solo/mute/compare controls, transcript-linked proof windows, and source-aware branch rendering from stems instead of flat mix assumptions.

## Checkpoint: 2026-07-12 03:38 UTC

- Approved branch render executor is now first-class in the Episode 4 audio control plane. It is generated during sequential refresh before post-listen runway reports, checked by manifest readback smoke, and shown in the Producer Command Center.
- Validation passed: `audio_workbench_sequential_control_plane_refresh.py` completed 43 ordered steps with 0 step failures and 0 post-check failures.
- Manifest readback smoke passed with 720 checks and 0 failures.
- Executor truth: `approvedBranchRenderExecutorStatus=blocked-waiting-for-human-listen`, `approvedBranchRenderCommandsExposed=false`, `approvedBranchRenderExecutorCanExecuteRealRenders=false`, `approvedBranchRenderExecutorBlockerCount=3`, `approvedBranchRenderExecutorResultCount=0`.
- Safety truth: approval state changed false, branch state changed false, render attempted false, upload attempted false, publication attempted false, original media mutated false.
- Producer command center truth: `audioProducerCommandCenterLatestStatus=ready-for-human-listen`, missing primary artifacts `0`, primary artifacts `63`, review cards `46`.
- Stable artifacts updated: `AUDIO_CONTROL_PLANE_SEQUENTIAL_REFRESH.md`, `PRODUCER_COMMAND_CENTER.md`, and `OPEN_APPROVED_BRANCH_RENDER_EXECUTOR.command` in the v006 baseline folder.
- Next safest action remains unchanged: Charlie listens to the v006 spine. If it passes, record guarded approval and refresh branch gates; then the approved branch render executor will expose the long-form and shorts render commands. If it fails, route notes into scoped v007 repair/proof candidates without overwriting v006.

## Checkpoint: 2026-07-12 03:59 UTC

- Goal blocker audit: not blocked by tooling. The active gate is a deliberate human-listen lock on Episode 4 v006 audio spine before long-form episode and shorts branches inherit from it.
- Compact manifest readback passed: sequential refresh status passed, 43 steps, 0 step failures, 0 post-check failures.
- Manifest consistency smoke remains green: 720 checks, 0 failures.
- Morning review launcher is ready: status ready-for-morning-audio-review, 0 hard stops, 4 grave-shift fast checks exposed.
- Safety truth preserved: approval state changed false, branch state changed false, render attempted false, upload attempted false, publication attempted false, original media mutated false.
- Current action remains: Charlie listens to v006, especially the four critical checks at 29:20, 34:22, 01:09:40, and 01:35:10. If it passes, record guarded approval, refresh the source-aware branch gate, then unlock branch renders only after preflight; if it fails, route exact notes to scoped v007 repair/proof candidates.

## Checkpoint: 2026-07-12 04:17 UTC

- Strengthened the quality-methods matrix into a three-layer quality ladder: audio spine quality, final long-form episode quality, and shorts/social-clip quality. This makes explicit that the current target is the Episode 4 v006 mastered audio spine, not final YouTube/Spotify/Apple episode readiness and not shorts readiness.
- Added six research-backed references to the matrix: ITU-R BS.1770, EBU R 128, Apple Podcasts audio requirements, Spotify supported audio episode formats, Spotify loudness normalization, and DNSMOS P.835. Each reference is recorded with how Quipsly applies it and what it cannot prove.
- Patched manifest readback smoke to verify the matrix quality-layer count and research-reference count, preventing silent drift.
- Validation passed: .
- Targeted matrix + readback validation passed with 722 manifest checks and 0 failures.
- Full sequential refresh passed: 43 steps, 0 step failures, 0 post-check failures.
- Current truth: matrix status quality-methods-matrix-ready, methods 9, quality layers 3, research references 6, audio spine gate machine-ready-human-listen-required with fail count 0, morning launcher ready-for-morning-audio-review with hard stops 0.
- Safety truth preserved: approval status remains machine-candidate-needs-human-listen-proof, packageReadyForHumanListen true, branchInheritanceReady false, branchRenderReady false, approved branch executor blocked-waiting-for-human-listen, commands exposed false, real renders false, render/upload/publication/original-media mutation all false.

## 2026-07-12 checkpoint - Episode 4 publication-first goal clarified

Clarified the active distinction: the current hard gate is the high-quality Episode 4 audio spine, not final episode or shorts approval. Final long-form and shorts branches should inherit only after machine checks plus Charlie's guarded human listen decision.

Strengthened the technical-audition layer so derived review snippets are first-class readback truth:

- `audioTechnicalAuditionSnippetPackLatestStatus=ready-for-human-technical-audition-snippets`
- `audioTechnicalAuditionSnippetPackSnippetCount=12`
- `audioTechnicalAuditionSnippetPackRenderedItemCount=12`
- `audioTechnicalAuditionSnippetPackMissingSnippetCount=0`
- `audioTechnicalAuditionSnippetPackDerivedReviewMediaRendered=True`
- `audioTechnicalAuditionSnippetPackRenderAttempted=False`
- `audioTechnicalAuditionSnippetPackBranchRenderAttempted=False`
- `audioTechnicalAuditionSnippetPackUploadAttempted=False`
- `audioTechnicalAuditionSnippetPackPublicationAttempted=False`
- `audioTechnicalAuditionSnippetPackOriginalMediaMutated=False`

Validation after the patch:

- Sequential refresh passed with `47` steps.
- Step failures: `0`.
- Post-check failures: `0`.
- Manifest readback smoke passed with `751` checks and `0` failures.

The next action remains Charlie's morning listen of v006. If it passes, source-aware branch gate/preflight can proceed toward rendering. If it fails, route a scoped v007 repair at the owning stage.

## 2026-07-13 checkpoint - source-aware branch render contract enforced

Clarified the active goal language so "audio spine approval" cannot be misread as "render every branch from the flattened mastered WAV." The mastered v006 spine remains the human-listen and delivery convenience artifact; branch editing/rendering inherits source-aware refined stems for Charlie, Homer, and clip/source audio.

New executable/readback truth:

- `approvedBranchRenderExecutorBranchRenderAudioTruth=source-aware-refined-stems`
- `approvedBranchRenderExecutorSourceAwareBranchRenderWillUseRefinedStems=true`
- `approvedBranchRenderExecutorMasteredSpineOnlyBranchRenderPrevented=true`
- `approvedBranchRenderExecutorMasteredSpineOnlyEditingAllowed=false`
- `approvedBranchRenderExecutorStatus=blocked-waiting-for-human-listen`
- `approvedBranchRenderCommandsExposed=false`
- `approvedBranchRenderExecutorRenderAttempted=false`

Validation after the patch:

- Approved branch executor regenerated without exposing render commands.
- Fast readback passed with `0` hard stops and `0` warnings.
- Manifest readback smoke passed with `1376` checks and `0` failures.

The next action remains unchanged: Charlie listens to v006 and records pass, fail, or needs-proof. If it passes, branch renders can unlock only through the source-aware branch gate, preflight, and renderer. If it fails, route scoped v007 repair/proof without overwriting v006.

## 2026-07-13 checkpoint - approval cannot bypass source-aware branch gate

The Episode 4 audio approval path now treats human listen approval as permission to run the branch gate, not as direct branch unlock.

New protected flow:

1. Human listens to v006 and records pass/fail/needs-proof through the guarded decision path.
2. If approved, `audio_workbench_record_listen_decision.py` records approval but keeps `branchInheritanceReady=false` and `branchRenderReady=false`.
3. `audio_workbench_branch_gate.py` must then prove source-aware branch inheritance: Charlie/Homer/clip-source refined stems, source-aware timing, post-approval source-aware inheritance, and no mastered-spine-only editing.
4. Branch-render preflight/executor may expose render commands only after that source-aware gate and render preflight pass.

Validation after the patch:

- Python compile passed for updated approval/gate/readback scripts.
- Real branch gate regenerated as `blocked-waiting-for-human-listen-proof`, with source-aware contract proof present.
- Approval path sandbox smoke passed and preserved the real manifest state.
- Approved branch executor remained `blocked-waiting-for-human-listen`, commands exposed `false`, render attempted `false`.
- Fast readback passed with `175` checks, `0` hard stops, and `0` warnings.
- Manifest readback smoke passed with `1376` checks and `0` failures.

Safety truth remains unchanged: no approval, branch unlock, render, upload, publication, or original-media mutation. Next action is still Charlie's real v006 listen decision.

## 2026-07-13 checkpoint - human approval surfaces match source-aware gate truth

The human-facing approval path has been cleaned up so reviewers and agents see the same contract the code now enforces: human approval authorizes the source-aware branch gate; it does not directly unlock branch renders.

Updated and regenerated:

- `HUMAN_LISTEN_DECISION_FRONT_DOOR.*`
- `EPISODE_4_MORNING_AUDIO_REVIEW.*`
- `audio-post-listen-outcome-router-v006-candidate-homer-preserving-clean-20260713-041204.*`
- `AUDIO_FAST_READBACK_CHECK.*`
- `AUDIO_MANIFEST_READBACK_CONSISTENCY_SMOKE.*`

Validation:

- Python compile passed for the touched scripts.
- Human decision front door status: `ready-for-human-listen-decision`; missing required artifacts `0`; approval state changed `false`; branch state changed `false`; render attempted `false`.
- Post-listen router status: `waiting-for-human-listen`; approval state preserved `true`; real branch render commands exposed `false`.
- Fast readback: `175` checks, `0` hard stops, `0` warnings.
- Manifest readback smoke: `1376` checks, `0` failures.

Current next action remains unchanged: Charlie listens to v006 and records pass, fail, or needs-proof. If it passes, the source-aware branch gate and preflight must still prove branch render readiness before any final episode or shorts render.

## 2026-07-13 checkpoint - post-listen router blocks stale flat-spine render readiness

Hardened the Episode 4 post-listen router so a future human approval cannot accidentally expose branch render commands from a stale generic `branchRenderReady=true` flag.

New router contract:

- Human approval still routes to the source-aware branch gate first.
- `approved-ready-for-branch-render` requires `sourceAwareBranchGateReady=true`.
- Branch render commands require `branchRenderAudioTruth=source-aware-refined-stems`.
- Flat-master-only editing must remain forbidden: `masteredSpineOnlyEditingAllowed=false`.
- If a manifest says `branchRenderReady=true` but source-aware evidence is missing or flat-master editing is allowed, the router reports `approved-source-aware-gate-blocked` and exposes no render commands.
- The router report now lists the post-approval gate sequence: guarded listen decision, source-aware branch gate, branch render preflight, approved executor, refined-stem branch rendering, branch QC/publication packets.

Validation:

- Python compile passed for the router, router smoke, fast readback, and manifest smoke scripts.
- Post-listen router regenerated with `routeStatus=waiting-for-human-listen`, approval state preserved `true`, and real branch render commands exposed `false`.
- Router smoke passed, including a stale-flat-render-ready scenario that correctly blocks render commands.
- Fast readback passed with `196` checks, `0` hard stops, and `0` warnings.
- Manifest readback smoke passed with `1376` checks and `0` failures.

Safety truth: no approval, final episode render, shorts render, upload, publication, schedule action, or original-media mutation occurred. Current gate remains Charlie's real v006 human listen decision.

## 2026-07-13 checkpoint - branch preflight hides real renders until source-aware approval path is legal

Hardened the Episode 4 branch-render preflight so it no longer merely describes source-aware readiness while still displaying a real render command. The preflight now treats command exposure as a gated state.

New preflight truth:

- `sourceAwareAudioTruthRequired=true`
- `sourceAwareAudioTruthReady=true` for the current v006 source-aware stem/timing evidence
- `branchRenderAudioTruth=source-aware-refined-stems`
- `branchAudioRenderedFromMasteredSpineOnly=false`
- `masteredSpineOnlyEditingAllowed=false`
- `realBranchRenderCommandsExposed=false` while the human-listen/branch-inheritance gate is still blocked
- The real render command is replaced with a blocked placeholder until human approval, source-aware branch gate, and preflight all pass

Validation:

- Python compile passed for branch preflight, fast readback, and manifest consistency smoke.
- `audio_workbench_branch_render_preflight.py --baseline-dir <v006-baseline>` regenerated `BRANCH_RENDER_PREFLIGHT.*` without exposing real branch render commands.
- Fast readback passed with `212` checks, `0` hard stops, and `0` warnings.
- Manifest readback smoke passed with `1403` checks and `0` failures.

Safety truth: no approval, branch unlock, final episode render, shorts render, upload, publication, schedule action, or original-media mutation occurred. Current gate remains Charlie's real v006 human listen decision.

## 2026-07-13 post-listen refresh control seam

Added `apps/QuipslyStudio/script/audio_workbench_post_listen_refresh.py` as the stable post-listen follow-up command.

Purpose:

- After a guarded human listen decision, refresh the source-aware branch gate, branch-render preflight, approved branch executor, post-listen runway, post-approval branch runway packet, and post-listen router in the correct order.
- Keep the approval recorder small and auditable: it records the human decision, while the refresh script recomputes readiness.
- Preserve the source-aware rule: branch edits/rendering inherit Charlie, Homer, and clip/source refined stems plus timing metadata, not the flattened mastered WAV alone.

Current safety design:

- Safe to run before approval; it reports `post-listen-refresh-waiting-for-human-listen`.
- Does not approve, render, upload, publish, schedule, or mutate original media.

## 2026-07-13 checkpoint - Codex listen intake uses the canonical post-listen refresh

The plain-language Codex listen-decision adapter now records the human listen decision through `audio_workbench_record_listen_decision.py` and, for real recorded decisions, refreshes the post-listen control plane through the single canonical `audio_workbench_post_listen_refresh.py` path.

This keeps the chat-facing route aligned with the same source-aware branch gate, branch-render preflight, approved executor, runway packet, and outcome router used by the official control plane. Dry-runs still do not refresh or mutate state, but they now report the canonical refresh script so the smoke path proves which control-plane seam will run after a real guarded decision.

Safety truth remains unchanged: this checkpoint does not approve v006, unlock branch inheritance, expose final render commands, render, upload, publish, schedule, or mutate original media.

Validation:

- Python compile passed for the Codex intake adapter, Codex intake smoke, and canonical post-listen refresh script.
- `audio_workbench_codex_listen_decision_intake_smoke.py` passed with `81` checks and `0` failures, including the canonical `audio_workbench_post_listen_refresh.py` seam.
- `audio_workbench_fast_readback_check.py` passed with `212` checks, `0` hard stops, and `0` warnings.
- `audio_workbench_manifest_readback_consistency_smoke.py` passed with `1473` checks and `0` failures.
- Full `audio_workbench_sequential_control_plane_refresh.py` passed with `104` steps, `0` step failures, and `0` post-check failures.
- Manifest truth stayed locked: `approvalStatus=machine-candidate-needs-human-listen-proof`, `branchInheritanceReady=false`, `branchRenderReady=false`, `branchRenderAudioTruth=source-aware-refined-stems`, `masteredSpineOnlyEditingAllowed=false`.

## 2026-07-13 checkpoint - Codex real-record approval path has a sandbox danger room

Added `apps/QuipslyStudio/script/audio_workbench_codex_listen_decision_record_sandbox_smoke.py`.

Purpose:

- Rehearse the exact chat-facing real-record command in a sandbox: `Approve v006 audio spine` plus `--record --confirm-human-listened`.
- Prove the adapter records only inside the sandbox, then runs the canonical `audio_workbench_post_listen_refresh.py` seam.
- Prove the sandbox wakes the source-aware branch path: branch inheritance ready, branch render ready, render commands exposed, branch audio truth `source-aware-refined-stems`, refined stems required, mastered-spine-only branch rendering prevented.
- Prove the real v006 baseline remains unapproved and branch-locked.

This is intentionally different from the dry-run intake smoke. The dry-run smoke proves chat parsing is safe. The sandbox record smoke proves the dangerous path is coherent without touching the real human approval gate.

Validation:

- Python compile passed for the new sandbox smoke, sequential control-plane runner, and manifest readback smoke.
- `audio_workbench_codex_listen_decision_record_sandbox_smoke.py` passed with `23` checks and `0` failures.
- Sandbox result: approval recorded only inside the sandbox, branch inheritance ready `true`, branch render ready `true`, branch render audio truth `source-aware-refined-stems`, real branch render commands exposed `true`, executor uses refined stems `true`, mastered-spine-only branch rendering prevented `true`.
- Real v006 baseline stayed locked: approval status `machine-candidate-needs-human-listen-proof`, branch inheritance `false`, branch render `false`.
- Fast readback passed with `212` checks, `0` hard stops, and `0` warnings.
- Manifest readback consistency smoke passed with `1498` checks and `0` failures.
- Full sequential control-plane refresh passed with `105` steps, `0` step failures, and `0` post-check failures.
- Safety truth stayed locked on the real baseline: no approval, no branch unlock, no final render, no shorts render, no upload, no publication, no schedule action, and no original-media mutation.
- Writes stable artifacts: `POST_LISTEN_REFRESH.json`, `POST_LISTEN_REFRESH.md`, `POST_LISTEN_REFRESH.html`, and `OPEN_POST_LISTEN_REFRESH.command`.
- The post-listen router now points pass/fail/refresh commands to this stable refresh seam instead of scattered individual gate commands.

Validation after adding the post-listen refresh seam:

- Python compile passed for the refresh script, decision recorder, router, router smoke, and manifest smoke.
- `audio_workbench_post_listen_refresh.py --baseline-dir <v006-baseline>` generated `POST_LISTEN_REFRESH.*` with status `post-listen-refresh-waiting-for-human-listen`, `7` ordered steps, `0` step failures, `45` readback checks, `0` hard stops, and `0` warnings.
- `audio_workbench_post_listen_outcome_router.py --baseline-dir <v006-baseline>` regenerated the router with `routeStatus=waiting-for-human-listen`, approval preserved `true`, and real branch render commands exposed `false`.
- `audio_workbench_post_listen_outcome_router_smoke.py --baseline-dir <v006-baseline>` passed.
- `audio_workbench_fast_readback_check.py --baseline-dir <v006-baseline>` passed with `212` checks, `0` hard stops, and `0` warnings.
- `audio_workbench_manifest_readback_consistency_smoke.py --baseline-dir <v006-baseline>` passed with `1420` checks and `0` failures.
- Safety truth preserved: approval state changed `false`, branch state changed `false`, render attempted `false`, upload attempted `false`, publication attempted `false`, and original media mutated `false`.

Current gate remains unchanged: Charlie still needs to listen to v006. If it passes, record guarded approval, then run the post-listen refresh seam; only after source-aware gate and preflight pass should branch rendering be considered.

Human-facing review surface cleanup after adding the refresh seam:

- Regenerated `HUMAN_LISTEN_DECISION_FRONT_DOOR.*`; status `ready-for-human-listen-decision`, missing required artifacts `0`, approval state changed `false`, branch state changed `false`, render attempted `false`.
- Regenerated listen decision matrix, marker review notes inbox, review handoff index, and stable `START_HERE_EPISODE_4_AUDIO_REVIEW.*` so reviewer-facing command text points to the post-listen refresh seam.
- `audio_workbench_post_listen_refresh.py --baseline-dir <v006-baseline>` remained `post-listen-refresh-waiting-for-human-listen`, with `7` steps, `0` step failures, `45` checks, `0` hard stops, and `0` warnings.
- Fast readback stayed green with `212` checks, `0` hard stops, and `0` warnings.
- Manifest readback smoke stayed green with `1420` checks and `0` failures.

Safety truth remained unchanged: no approval, no branch unlock, no final render, no upload, no publication, no schedule action, and no original-media mutation occurred.

## 2026-07-13 checkpoint - direct human approval recorder now enforces source-aware preflight

The approval guard has moved from only the generated terminal front door into `audio_workbench_record_listen_decision.py` itself. This closes the side-door path where a future agent could call the recorder directly, record a human approval, and accidentally let branch rendering proceed from flattened mastered-audio assumptions.

Current behavior:

- Approval statuses now run a source-aware approval preflight before a decision is recorded.
- Real approval paths regenerate `AUDIO_FAST_READBACK_CHECK.json` immediately before writing the decision.
- Dry-run approval reads the existing fast-readback report without mutating state.
- Approval is refused unless fast readback passes, hard stops are zero, final episode and shorts gates are still locked, source-aware stems and timing are ready, the post-approval rehearsal inherits source-aware audio truth, the approved sandbox executor inherits Charlie/Homer/clip-source refined stems, and mastered-spine-only editing remains disabled.
- Non-approval decisions such as `failed-human-listen` and `needs-focused-proof` still remain available for scoped repair/proof routing.

Validation:

- `python3 -m py_compile apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py apps/QuipslyStudio/script/audio_workbench_fast_readback_check.py apps/QuipslyStudio/script/audio_workbench_manifest_readback_consistency_smoke.py`
- Dry-run approval command passed with `sourceAwareApprovalPreflightStatus=source-aware-approval-preflight-passed` and `sourceAwareApprovalPreflightPassed=true`.
- `audio_workbench_fast_readback_check.py` passed with `checkCount=212`, `hardStopCount=0`, and `warningCount=0`.
- `audio_workbench_manifest_readback_consistency_smoke.py` passed with `checkCount=1420` and `failureCount=0`.
- Safety truth stayed locked: approval state changed `false`, branch state changed `false`, render attempted `false`, upload attempted `false`, publication attempted `false`, original media mutated `false`.

Current gate remains unchanged: Charlie still needs to listen to v006 and record pass, fail, or needs-proof. If it passes, the source-aware approval preflight is now enforced even when the recorder is called directly.

## 2026-07-13 checkpoint - reviewer-notes approval bridge cannot bypass source-aware gate

Imported reviewer notes are now guarded by the same source-aware approval preflight as the direct listen-decision recorder.

Problem found:

- `audio_workbench_record_listen_decision_from_notes.py` could dry-run and record imported reviewer/marker notes through its own bridge.
- Its approval path had been setting `branchInheritanceReady=true` after an approval decision, which could bypass the newer source-aware post-listen gate.

Fix:

- `audio_workbench_record_listen_decision_from_notes.py` now calls `validate_source_aware_approval_preflight` before any approval status can be recorded.
- Imported-notes approvals now keep `branchInheritanceReady=false` and `branchRenderReady=false` until the post-listen refresh proves the source-aware gate, branch preflight, executor, runway, and router.
- The bridge writes the same branch-readiness metadata as the direct recorder: `branchReadinessRefreshRequired`, `branchReadinessRequiresSourceAwareGate`, `branchRenderAudioTruth=source-aware-refined-stems`, `masteredSpineOnlyEditingAllowed=false`, and the post-listen refresh next action.
- The direct recorder can now read a manifest-registered fast-readback report during dry-run temp-baseline smokes, while real approval still regenerates fast readback first.
- `audio_workbench_reviewer_notes_decision_bridge_smoke.py` now asserts that all-pass reviewer notes and marker notes prove `sourceAwareApprovalPreflightPassed=true` during approval dry-runs.

Validation:

- `python3 -m py_compile` passed for the direct recorder, imported-notes bridge, reviewer-notes bridge smoke, and marker-review inbox smoke.
- `audio_workbench_reviewer_notes_decision_bridge_smoke.py` passed; real approval state preserved `true`; approval dry-runs now include source-aware preflight proof.
- `audio_workbench_marker_review_notes_inbox_smoke.py` passed; all-pass notes dry-route, needs-repair dry-route, no-notes, and wrong-baseline scenarios all behaved safely.
- `audio_workbench_fast_readback_check.py` passed with `checkCount=212`, `hardStopCount=0`, `warningCount=0`.
- `audio_workbench_manifest_readback_consistency_smoke.py` passed with `checkCount=1420`, `failureCount=0`.
- Current manifest truth stayed locked: `approvalStatus=machine-candidate-needs-human-listen-proof`, `branchInheritanceReady=false`, `branchRenderReady=false`, no render/upload/publication/original-media mutation.

Current gate remains unchanged: Charlie listens to v006 and reports pass, fail, or needs-proof. If approval comes from plain Codex text, the terminal recorder, listen-priority notes, marker notes, or imported reviewer notes, the source-aware branch gate must still run before rendering.

## 2026-07-13 checkpoint - human approval preflight now blocks on source-aware fast readback

The human approval preflight now checks the same source-aware package invariant as the guarded recorder. This closes the gap where a review page could say the package was ready for a human decision based on general listen artifacts while not explicitly proving that approval would route to source-aware branch work.

Changed:

- `audio_workbench_human_approval_preflight.py` now loads `AUDIO_FAST_READBACK_CHECK.json` and adds blocking checks for the fast-readback status, source-aware timing contract, approved-sandbox source-aware render contract, and flat-master editing prohibition.
- `audio_workbench_approval_path_smoke.py` now seeds its sandbox with copied control-plane evidence and symlinked large listen media before rehearsing approval. This preserves the real v006 baseline while giving the sandbox enough evidence to run the same approval preflight.
- The sandbox deliberately copies JSON/HTML/Markdown instead of symlinking them, because some stable files are regenerated inside the sandbox and symlink write-through would risk mutating real baseline evidence.

Validation on the current v006 baseline:

- Python compile passed for the changed scripts.
- Human approval preflight regenerated with `readyForHumanDecision=true` and source-aware fast-readback checks included.
- Approval path smoke passed with real manifest approval preserved `true`.
- Fast readback passed with `checkCount=212`, `hardStopCount=0`, `warningCount=0`.
- Manifest readback smoke passed with `checkCount=1420`, `failureCount=0`.

Current gate remains unchanged: Charlie still needs to listen to v006 and record pass, fail, or needs-proof. Approval remains permission to refresh the source-aware branch gate, not permission to render from the flattened mastered spine.

## 2026-07-13 checkpoint - human approval preflight is now promoted and smoke-verified

The human approval preflight is now part of the manifest readback contract and the serialized control-plane refresh.

Changed:

- `audio_workbench_human_approval_preflight.py` now promotes stable manifest aliases for preflight status, human-decision readiness, approval/branch locks, fast-readback status, source-aware timing readiness, approved-sandbox source-aware render readiness, flat-master editing prohibition, and non-mutating guardrails.
- `audio_workbench_manifest_readback_consistency_smoke.py` now verifies those promoted human-approval preflight aliases against `HUMAN_APPROVAL_PREFLIGHT.json`.
- `audio_workbench_sequential_control_plane_refresh.py` now regenerates the human approval preflight after fast readback, so the full control-plane refresh no longer carries a stale preflight artifact.

Validation on the current v006 baseline:

- Python compile passed for the changed scripts.
- Human approval preflight regenerated with `readyForHumanDecision=true`.
- Manifest readback smoke passed with `checkCount=1449`, `failureCount=0`.
- Approval path smoke passed with real manifest approval preserved `true`.
- Fast readback passed with `checkCount=212`, `hardStopCount=0`, `warningCount=0`.
- Full sequential control-plane refresh passed with `stepCount=103`, `stepFailureCount=0`, and `postCheckFailureCount=0`.

Current gate remains unchanged: v006 is still waiting for Charlie's human listen. If it passes, approval wakes the source-aware branch gate and preflight. It still does not authorize flat mastered-spine-only editing or external publication.

## 2026-07-13 checkpoint - Codex plain-language intake smoke is source-aware

The chat-facing human listen intake now has its own smoke proof.

Changed:

- Added `apps/QuipslyStudio/script/audio_workbench_codex_listen_decision_intake_smoke.py`.
- Updated `audio_workbench_codex_listen_decision_intake.py` so approval dry-runs can rehearse the strict recorder with a dry-run-only listened confirmation while real recording still requires explicit `--record --confirm-human-listened`.
- The smoke covers approve, needs-proof, fail, ambiguous approve/proof text, and record-without-confirmation refusal.

Validation:

- Python compile passed for the Codex intake and smoke scripts.
- Codex intake smoke passed with `72` checks and `0` failures.
- Approval dry-run passed the source-aware approval preflight and proved the approved sandbox executor inherits source-aware audio truth.
- Needs-proof and fail stayed non-approval routes.
- Ambiguous approval/proof language was refused.
- Real v006 truth stayed locked: `approvalStatus=machine-candidate-needs-human-listen-proof`, `branchInheritanceReady=false`, `branchRenderReady=false`, `branchRenderAudioTruth=source-aware-refined-stems`, and `masteredSpineOnlyEditingAllowed=false`.
- Safety truth stayed clean: no render, upload, publication, or original-media mutation.

Current gate remains unchanged: Charlie still needs to listen to v006 and report pass, fail, or needs-proof before any Episode 4 branch rendering can unlock.

Additional validation after the Codex intake smoke:

- `audio_workbench_fast_readback_check.py` passed with `212` checks, `0` hard stops, and `0` warnings.
- `audio_workbench_human_listen_decision_front_door_smoke.py` passed with `54` checks and `0` failures.
- `audio_workbench_manifest_readback_consistency_smoke.py` passed with `1449` checks and `0` failures.
- The real v006 manifest remained human-listen gated and source-aware after all checks.

## 2026-07-13 checkpoint - Codex intake smoke is now in the serialized control plane

The plain-language Codex listen-decision intake smoke is no longer a side artifact. It is now part of the official Episode 4 audio control-plane refresh and manifest readback contract.

Changed:

- `audio_workbench_sequential_control_plane_refresh.py` now runs `audio_workbench_codex_listen_decision_intake_smoke.py` after the human-listen front-door smoke.
- `audio_workbench_sequential_control_plane_refresh.py` post-checks now require the Codex intake smoke artifact to exist, pass, have zero failures, and stay non-mutating.
- `audio_workbench_manifest_readback_consistency_smoke.py` now loads `AUDIO_CODEX_LISTEN_DECISION_INTAKE_SMOKE.json` and verifies status, pass/failure counts, real locked branch truth, source-aware audio truth, flat-master prohibition, and non-mutating guardrails against manifest aliases.

Validation:

- Python compile passed for the changed control-plane, manifest smoke, Codex intake, and Codex intake smoke scripts.
- Codex intake smoke passed with `72` checks and `0` failures.
- Manifest readback smoke passed with `1473` checks and `0` failures.
- Full serialized control-plane refresh passed with `104` steps, `0` step failures, and `0` post-check failures.
- Fast readback passed with `212` checks, `0` hard stops, and `0` warnings.

Current v006 truth remains intentionally locked: `approvalStatus=machine-candidate-needs-human-listen-proof`, `branchInheritanceReady=false`, `branchRenderReady=false`, `branchRenderAudioTruth=source-aware-refined-stems`, and `masteredSpineOnlyEditingAllowed=false`.

Safety truth stayed clean: no final render, branch render, upload, publication, schedule action, or original-media mutation occurred.

Current gate remains unchanged: Charlie still needs to listen to v006 and report pass, fail, or needs-proof before Episode 4 branches can render.

## 2026-07-13 checkpoint - listen decision command center added

The Episode 4 v006 listen path now has a dedicated command-center artifact for the exact human/agent decision moment.

New stable artifacts in the v006 baseline folder:

- `AUDIO_LISTEN_DECISION_COMMAND_CENTER.json`
- `AUDIO_LISTEN_DECISION_COMMAND_CENTER.md`
- `AUDIO_LISTEN_DECISION_COMMAND_CENTER.html`
- `OPEN_AUDIO_LISTEN_DECISION_COMMAND_CENTER.command`

Why it matters:

- Charlie gets one recommended listen file: `episode4-mastered-audio-spine-v006.m4a`.
- Codex gets exact decision phrases: `Approve v006 audio spine`, `Needs proof around MM:SS because ...`, and `Fail, issue at MM:SS because ...`.
- The artifact states plainly that the mastered v006 spine is a listen/Premiere/delivery convenience artifact, not the editable branch truth.
- The source-aware branch rule is visible beside the decision: branch rendering must inherit Charlie, Homer, and clip/source refined stems on one timing contract.
- The danger-room proof is visible: sandbox recording can wake source-aware branch readiness without changing the real v006 manifest.

Validation on the current v006 baseline:

- Direct command-center generation passed with `missingRequiredArtifactCount=0`, `sourceAwareReady=true`, and `dangerRoomReady=true`.
- Fast readback passed with `checkCount=212`, `hardStopCount=0`, and `warningCount=0`.
- Manifest readback smoke passed with `checkCount=1549` and `failureCount=0`.
- Full serialized control-plane refresh passed with `stepCount=106`, `stepFailureCount=0`, and `postCheckFailureCount=0`.

Current v006 truth remains intentionally locked: `approvalStatus=machine-candidate-needs-human-listen-proof`, `branchInheritanceReady=false`, `branchRenderReady=false`, `branchRenderAudioTruth=source-aware-refined-stems`, and `masteredSpineOnlyEditingAllowed=false`.

Safety truth stayed clean: no approval change, branch unlock, final render, branch render, upload, publication, schedule action, or original-media mutation occurred.

## 2026-07-13 checkpoint - branch renderer dry-run exposes whole-source edit structure

The Episode 4 branch renderer now makes its dry-run plan more useful for humans and agents before any expensive or approval-gated render happens.

Updated `apps/QuipslyStudio/script/episode4_full_sync_export.py` so dry-runs expose:

- `branchAudioTruth=source-aware-refined-stems` when the v006 conformed baseline is used.
- `branchAudioWillUseSourceAwareStemsAfterApproval=true`.
- `branchAudioRenderedFromMasteredSpineOnly=false`.
- `masteredSpineOnlyEditingAllowed=false`.
- selected refined stem paths for Charlie, Homer, and clip/source.
- per-branch source chunks, source-role seconds, blank-gap seconds, reference-clip seconds, and whole-source chunking rules.

Why this matters: the renderer no longer says only "these are the output ranges." It now shows how those ranges map back onto whole source media and source-aware audio before rendering. The chunk map is promoted into `EPISODE_4_POST_APPROVAL_RENDER_REHEARSAL.*`, so this is durable control-plane truth, not temporary stdout. That supports conversation spacing, reaction-cut planning, clip weaving, and agent-visible QA without mutating source files.

Validation:

- `python3 -m py_compile apps/QuipslyStudio/script/episode4_full_sync_export.py` passed.
- Source-aware proof dry-run passed with `missingInputs=0`.
- Dry-run branch map:
  - `tight-30-45`: `11` ranges, `103` chunks, `44.6` minutes, roles `charlie_camera`, `homer_camera`, `reference_clip`.
  - `main-45-60`: `10` ranges, `134` chunks, `59.43` minutes, roles `charlie_camera`, `homer_camera`, `reference_clip`, plus `9.371s` blank gap.
  - `extended-60-80`: `7` ranges, `176` chunks, `78.8` minutes, roles `charlie_camera`, `homer_camera`, `reference_clip`, plus `19.371s` blank gap.
- `audio_workbench_post_approval_render_rehearsal.py` passed as `post-approval-render-rehearsal-ready-blocked-as-expected`, `branchCount=3`, `missingInputCount=0`.
- Fast readback passed with `212` checks, `0` hard stops, and `0` warnings.
- Manifest readback smoke passed with `1549` checks and `0` failures.

Safety truth: no human approval, branch unlock, final render, shorts render, upload, publication, schedule action, or original-media mutation happened. Current gate remains Charlie's real v006 human listen decision.

## 2026-07-13 checkpoint - manifest smoke now enforces source-aware branch chunk truth

The post-approval render rehearsal is now covered by stronger manifest readback checks. The smoke test no longer only verifies that the rehearsal report exists and basic branch counts match. It now also verifies the source-aware branch/render invariants that matter for Quipsly's editor model.

Updated `apps/QuipslyStudio/script/audio_workbench_manifest_readback_consistency_smoke.py` to verify:

- `audioPostApprovalRenderRehearsalBranchChunkCount` matches the rehearsal report.
- branch chunk count is nonzero.
- every planned branch reports `usesWholeSourceChunks=true`.
- blank-gap seconds, reference-clip seconds, and source-role seconds match the manifest aliases.
- source-role coverage includes `charlie_camera`, `homer_camera`, and `reference_clip`.
- branch audio truth is `source-aware-refined-stems`.
- branch rendering after approval will use source-aware refined stems.
- branch rendering is not mastered-spine-only.
- mastered-spine-only editing remains forbidden.

Current proof from `EPISODE_4_POST_APPROVAL_RENDER_REHEARSAL.json`:

- status: `post-approval-render-rehearsal-ready-blocked-as-expected`
- total source chunks: `413`
- blank-gap seconds: `28.742`
- reference-clip seconds: `443.643`
- source-role seconds: `{'charlie_camera': 5880.252, 'gap': 28.742, 'homer_camera': 4617.363, 'reference_clip': 443.643}`
- planned branches: `tight-30-45` has `103` chunks, `main-45-60` has `134` chunks, `extended-60-80` has `176` chunks.
- all planned branches use whole-source chunks.

Validation:

- Python compile passed for the manifest readback smoke, post-approval rehearsal, and branch renderer scripts.
- Post-approval render rehearsal regenerated successfully.
- Manifest readback smoke passed with `1564` checks and `0` failures.

Safety truth stayed clean: no human approval, branch unlock, final render, shorts render, upload, publication, schedule action, or original-media mutation happened. Current gate remains Charlie's real v006 human listen decision.

## 2026-07-13 checkpoint - approved branch executor proves refined stem plan before rendering

The approved branch render executor now carries concrete source-aware stem-plan evidence, not just a branch-audio truth label.

Updated `apps/QuipslyStudio/script/audio_workbench_approved_branch_render_executor.py` so the guarded executor loads the latest post-approval render rehearsal and verifies its `branchAudioPlan` before it can expose real render commands. The executor now reports and promotes:

- branch audio plan status
- selected refined stem count
- selected Charlie/Homer/clip-source refined stem rows
- missing required role ids
- missing refined stem path count
- source-aware branch stem path proof
- expected source-aware branch mix output name: `episode4-source-aware-branch-audio.wav`

Updated `apps/QuipslyStudio/script/audio_workbench_manifest_readback_consistency_smoke.py` so the independent smoke verifies those executor fields and invariants against the manifest.

Current executor proof:

- status: `blocked-waiting-for-human-listen`
- commands exposed: `false`
- can execute real renders: `false`
- branch audio plan status: `ready-source-aware-refined-stem-plan`
- selected refined stems: `3`
- missing roles: `[]`
- missing stem paths: `0`
- source-aware stem paths proved: `true`
- will use source-aware refined stems after approval: `true`
- mastered-spine-only branch render prevented: `true`
- render attempted: `false`

Validation:

- Python compile passed for the approved executor, manifest smoke, post-approval rehearsal, and branch renderer scripts.
- Post-approval render rehearsal regenerated successfully.
- Approved branch render executor regenerated successfully and stayed blocked before human listen.
- Manifest readback smoke passed with `1575` checks and `0` failures.

Safety truth stayed clean: no human approval, branch unlock, final render, shorts render, upload, publication, schedule action, or original-media mutation happened. Current gate remains Charlie's real v006 human listen decision.

## 2026-07-13 checkpoint - branch render preflight now proves refined stem plan

The branch-render preflight now carries the same concrete source-aware refined-stem plan evidence as the approved branch executor. This prevents the preflight from merely saying `source-aware-refined-stems` while hiding whether the actual Charlie/Homer/clip-source stem paths are available.

Updated `apps/QuipslyStudio/script/audio_workbench_branch_render_preflight.py` so it uses the renderer's own `branch_audio_plan()` and reports/promotes:

- branch audio plan status
- selected refined stem count
- selected Charlie/Homer/clip-source refined stem rows
- missing required role ids
- missing refined stem path count
- source-aware branch render will use refined stems
- source-aware branch stem paths proved
- expected source-aware branch mix output name: `episode4-source-aware-branch-audio.wav`

Updated validation/readback:

- `apps/QuipslyStudio/script/audio_workbench_fast_readback_check.py` now verifies the preflight branch-audio plan status, refined-stem count, missing roles, missing paths, refined-stem usage, and stem-path proof.
- `apps/QuipslyStudio/script/audio_workbench_manifest_readback_consistency_smoke.py` now checks both the direct preflight manifest aliases and the fast-readback aliases for those fields.

Current preflight proof:

- status: `blocked-before-branch-render`
- can render branches: `false`
- commands exposed: `false`
- branch audio plan status: `ready-source-aware-refined-stem-plan`
- selected refined stems: `3`
- missing roles: `[]`
- missing stem paths: `0`
- will use source-aware refined stems: `true`
- source-aware stem paths proved: `true`
- expected mix output: `episode4-source-aware-branch-audio.wav`
- blocker count: `3` from the intentional human-listen/branch gate lock.

Validation:

- Python compile passed for the branch preflight, approved executor, fast readback, manifest smoke, and branch renderer scripts.
- Branch-render preflight regenerated successfully and stayed blocked before human listen.
- Approved branch executor regenerated successfully and stayed blocked before human listen.
- Fast readback passed with `218` checks, `0` hard stops, and `0` warnings.
- Manifest readback smoke passed with `1593` checks and `0` failures.

Safety truth stayed clean: no human approval, branch unlock, final render, shorts render, upload, publication, schedule action, or original-media mutation happened. Current gate remains Charlie's real v006 human listen decision.

## 2026-07-13 checkpoint - post-listen refresh enforces refined-stem branch truth

The post-listen refresh bridge now verifies the same concrete source-aware refined-stem plan evidence as branch preflight and the approved branch executor. This matters because the refresh is the seam that runs after Charlie records the real v006 human listen decision; it must not let branch rendering unlock unless Charlie/Homer/clip-source refined stems are still the editable truth.

Updated `apps/QuipslyStudio/script/audio_workbench_post_listen_refresh.py` so its readback checks and generated report now verify/promote:

- branch preflight branch-audio plan status
- branch preflight selected refined stem count
- branch preflight missing role ids
- branch preflight missing stem path count
- branch preflight refined-stem usage and stem-path proof
- approved branch executor branch-audio plan status
- approved branch executor selected refined stem count
- approved branch executor missing role ids
- approved branch executor missing stem path count
- approved branch executor refined-stem usage and stem-path proof
- approved branch executor expected source-aware branch mix output name

Updated `apps/QuipslyStudio/script/audio_workbench_manifest_readback_consistency_smoke.py` so the independent manifest smoke verifies those new `audioPostListenRefresh*` aliases and requires:

- `ready-source-aware-refined-stem-plan`
- at least `3` selected refined stems
- no missing required roles
- no missing refined stem paths
- proved refined-stem paths
- refined stems used after approval

Validation:

- Python compile passed for the post-listen refresh, fast readback, and manifest smoke scripts.
- Branch-render preflight regenerated successfully and stayed blocked before human listen.
- Approved branch render executor regenerated successfully and stayed blocked before human listen.
- Post-listen refresh regenerated successfully with status `post-listen-refresh-waiting-for-human-listen`, `7` steps, `0` step failures, `57` checks, `0` hard stops, and `0` warnings.
- Fast readback passed with `218` checks, `0` hard stops, and `0` warnings.
- Manifest readback smoke passed with `1616` checks and `0` failures.

Safety truth stayed clean: no human approval, branch unlock, final render, shorts render, upload, publication, schedule action, or original-media mutation happened. Current gate remains Charlie's real v006 human listen decision.

## 2026-07-13 checkpoint - fast readback now watches post-listen refined-stem proof

The cheap fast-readback tier now verifies that the post-listen refresh bridge is present, current, non-mutating, and still source-aware. This makes the everyday morning check catch stale/missing post-listen branch proof without requiring a full slow control-plane regeneration.

Updated `apps/QuipslyStudio/script/audio_workbench_fast_readback_check.py` so it now loads `POST_LISTEN_REFRESH.json`, verifies its source-aware refined-stem plan evidence, includes it in required artifact readback, and promotes `audioFastReadbackCheckPostListenRefresh*` manifest aliases.

Updated `apps/QuipslyStudio/script/audio_workbench_manifest_readback_consistency_smoke.py` so the broad smoke verifies those new fast-readback aliases against the fast report and manifest.

Current fast-readback proof:

- status: `fast-readback-passed-human-listen-still-required`
- post-listen refresh status: `post-listen-refresh-waiting-for-human-listen`
- post-listen refresh step failures: `0`
- post-listen refresh hard stops: `0`
- post-listen refresh audio truth: `source-aware-refined-stems`
- branch preflight plan status: `ready-source-aware-refined-stem-plan`
- branch executor plan status: `ready-source-aware-refined-stem-plan`
- missing roles: `[]`
- missing stem paths: `0`
- refined stem paths proved: `true`

Validation:

- Python compile passed for the post-listen refresh, fast readback, and manifest smoke scripts.
- Fast readback passed with `247` checks, `0` hard stops, and `0` warnings.
- Manifest readback smoke passed with `1633` checks and `0` failures.

Safety truth stayed clean: no human approval, branch unlock, final render, shorts render, upload, publication, schedule action, or original-media mutation happened. Current gate remains Charlie's real v006 human listen decision.

## 2026-07-13 checkpoint - human-listen approval now guards source-aware branch audio truth

Tightened the Episode 4 v006 human-listen decision path so approval cannot be recorded unless the fast readback still proves both layers of source-aware branch safety:

- The post-approval sandbox/executor still inherits source-aware audio truth.
- The post-listen refresh still reports a ready source-aware refined-stem branch audio plan for the branch preflight and branch executor.
- Required refined stem roles remain Charlie, Homer, and clip/source.
- Missing refined-stem roles or missing stem paths block approval.
- Mastered-spine-only editing remains explicitly forbidden for downstream branch work.

Changed files:

- `apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py`
- `apps/QuipslyStudio/script/audio_workbench_human_listen_decision_front_door.py`
- `apps/QuipslyStudio/script/audio_workbench_human_listen_decision_front_door_smoke.py`

Validation passed without recording real approval:

- Python compile passed for the touched decision/front-door/smoke scripts plus fast readback and manifest smoke.
- Human-listen front door regenerated with status `ready-for-human-listen-decision`.
- Fast readback passed: `fast-readback-passed-human-listen-still-required`, `checkCount=247`, `hardStopCount=0`, `warningCount=0`.
- Human-listen front-door smoke passed: `failureCount=0`, `checkCount=56`.
- Manifest readback consistency smoke passed: `failureCount=0`, `checkCount=1633`.
- Approval dry-run passed only after the stricter source-aware approval preflight: `source-aware-approval-preflight-passed`.
- Front-door smoke now includes a stale-report regression trap: a synthetic stale post-listen branch executor plan must be rejected before approval.

Safety state preserved: no real human-listen decision recorded, no branch unlock, no final episode render, no shorts render, no upload, no publication, and no original media mutation.

Current gate remains unchanged: Charlie still needs to listen to `episode4-mastered-audio-spine-v006.m4a` and report approve, fail, or needs proof before Episode 4 branch rendering can proceed.

## 2026-07-13 checkpoint - product priority correction

Charlie called out a real product-process drift: Quipsly has been spending too
much attention on approval machinery compared with professional editing
features, audio quality, core UX, and creative throughput. Keep the safety
boundary, but resize it.

Updated operating priority:

- Build the thing that makes the product worth using first.
- Use approval/receipt/gate systems only where they protect irreversible work,
  external publishing, account mutation, source-truth loss, or false claims.
- Do not add more approval surfaces just because the current goal is near a
  human-review seam.
- If an approval tool starts taking more time than the user-facing workflow it
  protects, simplify the approval tool and return effort to the editor/audio
  workflow.
- For Episode 4, keep the single necessary guard: no final render or publication
  claim until Charlie approves the v006 audio spine. Do not keep expanding the
  approval framework unless it directly prevents a source-aware audio regression
  or a false publication claim.

Practical next direction after the current guard fix: return effort to the
source-aware audio spine, branch rendering quality, edit timing, shorts quality,
and Quipsly Studio UX.

## 2026-07-13 checkpoint - source-aware listen workbench replaces paperwork-first review

Built the first product-facing source-aware audio workbench for Episode 4:

- `apps/QuipslyStudio/script/audio_workbench_source_aware_listen_workbench.py`
- stable HTML: `AUDIO_SOURCE_AWARE_LISTEN_WORKBENCH.html`
- stable JSON: `AUDIO_SOURCE_AWARE_LISTEN_WORKBENCH.json`
- stable Markdown: `AUDIO_SOURCE_AWARE_LISTEN_WORKBENCH.md`
- open command: `OPEN_AUDIO_SOURCE_AWARE_LISTEN_WORKBENCH.command`

This is deliberately a creative workbench, not another approval page. It shows:

- the mastered v006 listener copy;
- Charlie refined dialogue stem;
- Homer refined dialogue stem;
- clip/source refined stem;
- synced jump/play controls for master and stems;
- stem loudness summaries;
- 66 review windows from the segment loudness map;
- links to the mission packet, loudness map, and stem manifest.

Validation:

- Python compile passed for the new workbench script.
- Generation against the current v006 baseline passed.
- Result status: `source-aware-listen-workbench-ready`.
- Missing audio count: `0`.
- Stem count: `3`.
- Review window count: `66`.
- HTML contains the required product-facing sections: master player, synced-stem playback, source-aware refined stems, and review windows.

Safety truth stayed clean: no human approval, branch unlock, final render,
shorts render, upload, publication, schedule action, or original-media mutation
happened.

Product lesson applied: clarity should live inside usable creative surfaces
first. Reports and approval tools are fallback evidence, not the user
experience.

## 2026-07-13 checkpoint - Audio Room v1 turns stems into a visual editor surface

Built the first large native Studio Audio Room for Episode 4 source-aware listening:

- The Audio workbench now has an "Open Audio Room" action.
- Audio Room presents a wide DAW-like surface instead of a narrow report panel.
- It shows one shared sequence clock, transport controls, an overview strip, and stacked stem lanes.
- Charlie, Homer, and clip/source audio are visualized as separate waveform/loudness lanes on the same timeline.
- Dragging the overview or any lane scrubs the shared sequence time.
- Double-clicking/playing a lane solos that stem at the current sequence time.
- The room can jump the main editor to the same sequence time and copy an agent-readable audio state.
- The flat mix remains labeled as reference/delivery only, not editing truth.

Validation:

- `./script/build_and_run.sh --verify` passed after the Audio Room change.
- Existing warnings are macOS `onChange(of:perform:)` deprecations in `WorkspaceView.swift`, not Audio Room build failures.

Next target:

- Promote Audio Room from modal proof into a first-class editor workspace, improve waveform fidelity, add live meters/solo-mute comparison, and make playhead movement continuously reflect actual playback rather than only manual scrub/jump.

## 2026-07-13 Audio Room checkpoint

QuipslyStudio now opens a source-aware Audio Room from the Audio Grove workbench. The room is intentionally visual-first: one shared sequence clock, a whole-episode overview, zoomable detail lanes, separate Charlie/Homer/clip stems, per-stem play controls, reference-mix playback, review-mark navigation, editor sync, and copy-state support. This is the current direction for audio quality control: humans and agents should see and hear separate polished stems instead of depending on a flattened master or explanatory approval forms.

Validation: `apps/QuipslyStudio/script/build_and_run.sh --verify` passed on 2026-07-13 after the Audio Room zoom/detail and organic control styling changes. Remaining build output was existing macOS 14 `onChange` deprecation warnings in `WorkspaceView.swift`.

## 2026-07-13 Audio Room speaker-balance checkpoint

Audio Room v1 now includes a speaker-balance strip between the whole-episode overview and the stem detail lanes. The strip renders Charlie activity, Homer activity, and overlap on the same visible time window so the user and Codex can see conversational handoff, bleed, silence, and potential reaction moments without reading a form. The room also gained quick 30s and 2m detail-window controls, warm Quipsly transport styling, and retained separate Charlie/Homer/clip stems as the editable audio truth.

Validation: `apps/QuipslyStudio/script/build_and_run.sh --verify` passed after the speaker-balance and transport styling changes. Visual proof captured at `/tmp/quipsly-audio-room-speaker-balance-20260713-102221-warm2.png`.

## 2026-07-13 Audio Room range-listening checkpoint

Quipsly Studio Audio Room now supports a metadata-only listening range for source-aware audio review. The range can be set with `Set In` / `Set Out`, cleared, and played either as the selected source stem or the reference mix. The same range is drawn as a honey overlay across the whole-episode source overview, the Charlie/Homer speaker-balance strip, and each detailed source stem lane.

Product meaning: Charlie and Codex can now point at the same exact sound window visually while listening, without creating another review form or approval surface. This keeps the editor moving toward the intended professional audio workbench: separate refined stems, one shared sequence clock, visible source truth, and no mutation of original media.

Validation:
- `apps/QuipslyStudio/script/build_and_run.sh --verify` returned successfully on the real QuipslyStudio app path.
- Real app visual proof with range controls visible: `/tmp/quipsly-audio-room-range-20260713-104244.png`.
- Real app visual proof with a selected range rendered across speaker balance and stem lanes: `/tmp/quipsly-audio-room-range-selected-20260713-104701.png`.

Notes:
- No media, exports, approvals, branch gates, publication receipts, or source files were mutated.
- The running app still presents as `QuipslyMac` in the macOS app menu while the window says `Quipsly Studio`; that identity mismatch is not part of this audio range feature but should be cleaned up in a later app-polish pass.

## 2026-07-13 Audio Room live stem meter checkpoint

Quipsly Studio Audio Room now includes a compact live stem meter shelf above the detailed waveform lanes. Each source-aware stem card stays on the shared sequence clock, shows current RMS/peak activity near the playhead, exposes a play action for that stem, and keeps Charlie, Homer, and clip/source audio visually separate before the user dives into the larger waveform lanes.

Product meaning: the room is moving away from report-driven audio review and toward professional listening-room behavior. The human and Codex can now glance at separate stems, see which source is active or quiet at the current playhead, and play the relevant source without leaving the editor. The canonical edit truth remains separate refined stems on one clock; the flat mix remains secondary.

Validation:
- `apps/QuipslyStudio/script/build_and_run.sh --verify` returned successfully on the real QuipslyStudio app path.
- The only build output was existing `WorkspaceView.swift` macOS 14 `onChange(of:perform:)` deprecation warnings.
- Real app visual proof with live stem meters: `/tmp/quipsly-audio-room-live-meters-20260713-110132.png`.

Notes:
- No media, exports, approvals, branch gates, publication receipts, or source files were mutated.
- The current default playhead at 0:00 can still make the live meters look quiet until the user jumps to active dialogue; a future polish pass should add a visual `first voice` / `next spoken phrase` jump or open the room near the first meaningful activity window.

## 2026-07-13 Audio Room voice-navigation checkpoint

Quipsly Studio Audio Room now starts closer to meaningful speech when opened at the beginning of the episode and exposes explicit `First voice` and `Next voice` transport actions. The voice cues are derived from the same source-aware per-stem loudness windows that power the visual meters, so the action is tied to actual stem evidence rather than a hardcoded timestamp.

Product meaning: the room is becoming a listening instrument. A user no longer has to manually scrub away from quiet start-of-file space before seeing and hearing useful audio, and Codex/human reviewers can jump between meaningful speech regions while keeping the separate Charlie, Homer, and clip/source stems visible on the same sequence clock.

Validation:
- `apps/QuipslyStudio/script/build_and_run.sh --verify` returned successfully on the real QuipslyStudio app path.
- Build output showed only the normal Xcode multiple-destination warning.
- Real app visual proof with readable transport and voice navigation: `/tmp/quipsly-audio-room-first-voice-transport-20260713-111405.png`.

Notes:
- The transport row now uses a horizontal scroll container with fixed-size controls so labels do not collapse into unreadable wrapped text.
- No media, exports, approvals, branch gates, publication receipts, or source files were mutated.

## 2026-07-13 Audio Room conversation-focus checkpoint

- Added a conversation-focus surface inside `SourceAwareAudioListeningRoom` so the editor shows the current playhead moment as Charlie, Homer, overlap, source, or quiet/transition space from separate source-aware stems.
- Added per-stem focus tiles with live RMS/peak meters, selected/dominant outlines, and one-click solo playback at the shared sequence time.
- Added `Next overlap` transport navigation to jump to the next meaningful Charlie/Homer overlap, supporting echo/bleed diagnosis and more natural cut decisions.
- Kept the model source-aware and non-destructive: this is a visibility/control layer over existing refined stems and segment windows, not a flattened-spine mutation or approval workflow.
- Validation passed with `./script/build_and_run.sh --verify` in `apps/QuipslyStudio`; launch succeeded with only existing `WorkspaceView` macOS `onChange(of:perform:)` deprecation warnings.
- Visual proof screenshot: `/tmp/quipsly-audio-room-conversation-focus-20260713-112956.png`.

## 2026-07-13 Audio Room playback-clock checkpoint

- Wired source-aware audio playback into the shared sequence clock: `AVPlayer` now installs a periodic time observer so stem/reference playback updates the Audio Room playhead, live meters, conversation-focus panel, and bound sequence time.
- Added teardown for the local audio player/time observer when the workbench panel disappears so the player does not leave stale observers behind.
- Added Audio Room playhead-follow behavior: when playback advances the shared clock, the visible detailed waveform window keeps the current playhead in view.
- This preserves source-aware truth: playback follows the selected refined stem or reference mix without mutating original media, stems, branch recipes, approval state, or render gates.
- Validation passed with `./script/build_and_run.sh --verify` in `apps/QuipslyStudio`; launch succeeded with only existing `WorkspaceView` macOS `onChange(of:perform:)` deprecation warnings.
- Visual proof screenshot: `/tmp/quipsly-audio-room-playback-clock-20260713-114615.png`.
- Remaining proof target: do an app-interaction pass that presses Play selected stem and visually confirms the playhead/meter/window chase during live playback.

## 2026-07-13 Audio Room visual workbench checkpoint

- Reworked the Episode 4 Audio Room hierarchy so visual evidence comes before transport controls: whole-episode waveform, conversation map, current stem state, and side-by-side Charlie/Homer dialogue scopes.
- Added pinch-to-zoom behavior on the Audio Room so the visible window can tighten or widen without leaving the sound workbench.
- Added a side-by-side dialogue scope using the same source-aware waveform renderer as the stem lanes. This keeps Charlie and Homer as separate refined stems on one sequence clock instead of collapsing them into a misleading single spine.
- Demoted explanatory text from the main focus panel into hover help; the visible UI now relies more on waveform shape, color, meters, and the shared playhead.
- Verified through `./script/build_and_run.sh --verify`.
- Verified in the running app at `/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/DerivedData/Build/Products/Debug/QuipslyMac.app` that Play selected stem advances the shared clock and updates the overview, conversation map, dialogue scopes, and independent Charlie/Homer/source meters.
- Screenshot evidence: `/tmp/quipsly-audio-room-dialogue-scope-20260713-1217.png`.
- QA note: generic `QuipslyMac` automation can still launch the abandoned `apps/quipsly-mac/dist` bundle. Use the exact active QuipslyStudio bundle path for agent-driven UI checks until the product identity is split cleanly.

## 2026-07-13 Audio Room waveform-gain checkpoint

- Added visual-only waveform gain controls (`Wave +`, `Wave -`) to make quiet stems easier to inspect without changing audio gain, source stems, timing, or mastering truth.
- Passed the visual gain through the side-by-side Charlie/Homer dialogue scope and the full detailed stem lanes so the Audio Room stays visually consistent.
- Verified through `./script/build_and_run.sh --verify`.
- Verified in the running app that the `Wave +` control expands waveform visibility while dB/readiness values remain source-derived.
- Research alignment: Logic Pro distinguishes horizontal/vertical waveform zoom and explicitly supports waveform amplitude zoom while preserving non-destructive audio-region editing; Descript-style multitrack enhancement reinforces keeping per-track controls separate instead of flattening too early.
- Screenshot evidence: `/tmp/quipsly-audio-room-waveform-gain-20260713-1231.png`.

## 2026-07-13 Audio Room sound-glass checkpoint

- Added `Sound glass`, a compact DAW-like visual strip between the conversation map and current stem state.
- The strip renders Charlie/Homer voice bands, clip/source bed presence, amber overlap wash, selected listen range, and the shared red playhead from the same source-aware stem windows already used by the Audio Room.
- This is intentionally visual instrumentation, not another report page: it helps Charlie/Codex scan voice, overlap, quiet, and source/clip presence without flattening the stems or mutating audio.
- Verified through `./script/build_and_run.sh --verify`.
- Verified in the running app at `/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/DerivedData/Build/Products/Debug/QuipslyMac.app` that playback advances the shared clock and moves the playhead through Sound glass, dialogue scopes, conversation state, and independent meters.
- Screenshot evidence: `/tmp/quipsly-audio-room-sound-glass-20260713-1245.png`.

## 2026-07-13 Audio Room range-loop checkpoint

- Added source-aware range playback semantics to the Episode 4 Audio Room.
- `Stem` and `Mix` range buttons now play only the selected In/Out range instead of continuing indefinitely.
- `Loop stem` and `Loop mix` make a selected range repeat against the shared sequence clock for producer-style quality control.
- Pause now clears the visible listening label so the UI does not imply audio is still playing.
- Validated through `apps/QuipslyStudio/script/build_and_run.sh --verify` and real app inspection of `/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/DerivedData/Build/Products/Debug/QuipslyMac.app`.

## 2026-07-13 Audio Room quick-trap checkpoint

- Added quick producer range buttons: `Trap 10s` and `Trap 30s` center an audition range around the current playhead.
- The trap action also tightens the visible waveform window so Charlie/Homer/source stems become easier to compare at the problem moment.
- Validated in the running app: `Trap 10s` at 0:10 produced a 0:05 -> 0:15 range, enabled Stem/Mix/Loop controls, and kept the shared playhead visible across Sound glass and Dialogue scope.

## 2026-07-13 Audio Room keyboard checkpoint

- Added pro-editor keyboard shortcuts without adding more visual instruction clutter: `M` mix, `K` pause, `V` next voice, `O` next overlap, `T` trap 10s, `Shift-T` trap 30s, `L` loop stem, `Shift-L` loop mix.
- Revalidated through `apps/QuipslyStudio/script/build_and_run.sh --verify` and real app inspection.

## 2026-07-13 Audio Room level-guide checkpoint

- Added subtle level guide bands to detailed waveform canvases so the audio display starts communicating quiet/dialogue/hot territory visually.
- This follows the DAW/RX/Audition direction: make the waveform/scope itself more truthful before adding more review forms.
- Revalidated through `apps/QuipslyStudio/script/build_and_run.sh --verify` and real app inspection.

### 2026-07-13 Audio Room visual workbench checkpoint
- Built and verified a source-aware Mixing Desk in `apps/QuipslyStudio/Sources/SharedUI/SourceAwareAudioWorkbenchPanel.swift`.
- The Audio Room now shows Charlie and Homer side-by-side near the top of the room with waveform strips, present-moment level meters, direct stem play buttons, and source/refined/retention bars.
- Reordered the Audio Room so the first visual read is the whole-episode overview followed by the speaker Mixing Desk, then conversation/sound-glass maps and detailed lanes.
- Verified through `apps/QuipslyStudio/script/build_and_run.sh --verify` and inspected the exact active bundle at `apps/QuipslyStudio/DerivedData/Build/Products/Debug/QuipslyMac.app`.
- Current product intent: make Episode 4 audio quality inspectable by sight and sound, not by approval forms. Preserve separate refined speaker stems as source-aware working truth; treat any flattened mix only as an export/listen artifact.

### 2026-07-13 Fine waveform checkpoint
- Added `scripts/audio/build_audio_fine_waveform_map.py` to generate a schema-compatible high-resolution audio map from existing stem WAV files.
- Generated `AUDIO_FINE_WAVEFORM_MAP.json` beside the Episode 4 v006 source-aware audio artifacts using 0.5-second windows.
- Updated the Audio Room loader to prefer `AUDIO_FINE_WAVEFORM_MAP.json` and fall back to `AUDIO_SEGMENT_LOUDNESS_MAP.json` if the fine map is missing.
- Verified the real app still builds and launches through `apps/QuipslyStudio/script/build_and_run.sh --verify`.
- Confirmed in the active QuipslyMac app that the Audio Room renders the denser waveform data and keeps Charlie/Homer visible in the new Mixing Desk.

### 2026-07-13 Audio Room Mixing Desk control checkpoint
- Added local listening controls directly to the Audio Room Mixing Desk: back 5s, play mix, pause, forward 5s, zoom in, zoom out, and fit.
- Verified in the live app that forward 5s advances the one shared Episode 4 clock and all visible maps move together.
- Fixed Audio Room zoom anchoring so zooming centers on the current playhead instead of drifting to the old visible-window center.
- Verified in the live app that zooming at 0:16 changes the view from `0:00 -> 5:00` to `0:00 -> 2:30`, keeping the current playhead visible and inspectable.
- Product intent: the Audio Room should feel like a visual listening desk, not a report page. Controls now live with the speaker waveforms so Charlie/Codex can listen, nudge, zoom, and compare Charlie/Homer without hunting through explanatory panels.

### 2026-07-13 Conversation dominance river checkpoint
- Added a visual dominance river to the Audio Room conversation map.
- The map now synthesizes Charlie vs Homer moment-to-moment energy as a light bead trail while preserving separate speaker waveform truth in the Mixing Desk and detailed stem lanes.
- Verified the app builds and the live Audio Room renders the river without hiding the source/refined speaker controls.
- Product intent: help producer/editor decisions by showing conversational flow visually, not by requiring another report or approval screen.

### 2026-07-13 Audio Room dialogue scope checkpoint
- Added a large Dialogue Scope to `SourceAwareAudioWorkbenchPanel.swift` so Charlie and Homer appear as side-by-side source-aware audio instruments on the same sequence clock.
- The scope renders detailed waveform lanes with a spectral-style activity bed, current RMS/peak readouts, and a shared playhead target so audio cleanup is visible and listenable instead of buried in report forms.
- Kept the source model intact: refined stems remain separate, equal-length, source-aware tracks; the mixed reference remains secondary.
- Verified the app through `apps/QuipslyStudio/script/build_and_run.sh --verify`; build passed with only existing `WorkspaceView.swift` macOS 14 `onChange(of:perform:)` deprecation warnings.
- Visually inspected the live app via screenshot at `/tmp/quipsly-audio-room-dialogue-scope-20260713.png`; the Audio Room renders the new Dialogue Scope, whole-episode waveform, balance meter, and stem lanes in the active QuipslyStudio bundle.
- Product intent: move Episode 4 audio work toward a professional DAW-like listening room: big visual truth first, minimal prose, and enough agent/human visibility to discuss audio quality from what we can both see and hear.

### 2026-07-13 Audio Room conversation-river checkpoint
- Added a `ProAudioConversationRiver` to the Audio Room Dialogue Scope so Charlie/Homer dominance, overlap, and quiet space are visible across the current zoom window without opening a report page.
- The river is interactive: dragging it seeks the same source-aware sequence clock used by the Charlie and Homer waveform panes.
- Preserved the current audio truth model: separate refined stems stay separate, the shared playhead remains the clock, and no approval/branch/render/publish state changed.
- Verified via `apps/QuipslyStudio/script/build_and_run.sh --verify`; build and launch passed with only the existing `WorkspaceView.swift` macOS 14 `onChange(of:perform:)` deprecation warnings.
- Visually inspected the running app at `/tmp/quipsly-audio-room-conversation-river-20260713.png`; the Audio Room shows the whole-episode waveform, Dialogue Scope, conversation river, balance meter, and source-aware stem lanes in the active bundle.
- Product intent: replace explanatory audio bureaucracy with DAW-like visual truth that Charlie and Codex can discuss directly while working toward a professional Episode 4 audio spine and later render branches.

### 2026-07-13 Audio Room three-stem scope checkpoint
- Promoted the required clip/source stem into the same top Audio Room Dialogue Scope as Charlie and Homer.
- Fixed the `twinStemConsole` feed so it passes all non-master source-aware stems instead of filtering the Mixing Desk down to Charlie/Homer only.
- The Audio Room now visually agrees with the goal's editor-grade audio truth: Charlie refined stem, Homer refined stem, and clip/source stem on one sequence clock, with the combined mix remaining secondary.
- Verified through `apps/QuipslyStudio/script/build_and_run.sh --verify`; build/launch completed without compiler failure.
- Visually inspected the active app at `/tmp/quipsly-audio-room-three-stem-scope-20260713.png`; the top Audio Room now shows Charlie, Homer, and Clip source in the same large visual surface, followed by the conversation river and lower stem lanes.
- Safety truth: no approval state, branch render state, publication state, or original media changed. The v006 audio spine remains human-listen gated.

### 2026-07-13 Audio Room proof-window ribbon checkpoint
- Added a ranked proof-window ribbon directly below the whole-episode overview in the Audio Room.
- Proof cards reuse existing `snapshot.reviewWindows` truth and prioritize critical/proof/ASR/bleed/source/energy windows ahead of quiet chronological windows.
- Clicking a proof card sets a focused listen range, moves the shared sequence clock, and syncs the main editor clock without changing approval, branch render, publication, or original media state.
- Verified through `apps/QuipslyStudio/script/build_and_run.sh --verify`; build/launch completed without compiler failure.
- Visually inspected the active app at `/tmp/quipsly-audio-room-ranked-proof-ribbon-crop-20260713.png`; the Audio Room shows prioritized proof-window cards above the three-stem Mixing Desk.
- Product intent: make the morning listen path feel like a professional editor, not a scavenger hunt through report artifacts.

### 2026-07-13 Audio Room listening-lens checkpoint
- Added a visual `Listening Lens` above the Mixing Desk in `apps/QuipslyStudio/Sources/SharedUI/SourceAwareAudioWorkbenchPanel.swift`.
- The lens shows Charlie refined dialogue, Homer refined dialogue, and clip/source audio side-by-side in the same focused playhead window.
- Clicking or dragging inside any lens card selects that stem and seeks the shared sequence clock; no separate audio clock or chopped-clip model was introduced.
- The lens uses large waveform/loudness shapes, subtle level bands, selected-range shading, and the same playhead line instead of another explanatory report surface.
- Verified through `apps/QuipslyStudio/script/build_and_run.sh --verify`; build/launch completed with only existing `WorkspaceView.swift` macOS 14 `onChange(of:perform:)` deprecation warnings.
- Visually inspected the active app at `/tmp/quipsly-audio-room-listening-lens-crop-20260713.png`; the Audio Room shows whole-episode truth, proof windows, the new three-stem Listening Lens, and the existing Mixing Desk in one scrollable professional audio surface.
- Safety truth: no approval state, branch render state, publication state, export artifact, or original media changed.
- Product intent: make the Audio Room something Charlie and Codex can discuss by looking and listening, not by reading bureaucracy.

### 2026-07-13 Audio Room lens audition-control checkpoint
- Wired the `Listening Lens` into the existing Audio Room audition path instead of creating a second playback model.
- Each lens stem card now has compact play and loop controls for the visible focused range.
- The lens also has focused-range Mix, Loop, and Pause controls below the cards.
- Callback truth: lens controls call the existing `onPlayTrackRange`, `onPlayMixRange`, and `onPause` closures, preserving one shared sequence clock and one source-aware playback path.
- Verified through `apps/QuipslyStudio/script/build_and_run.sh --verify`; build/launch completed with only existing `WorkspaceView.swift` macOS 14 `onChange(of:perform:)` deprecation warnings.
- Visually inspected the active app at `/tmp/quipsly-audio-room-lens-audition-controls-crop-20260713.png`; the lens shows per-stem play/loop icons plus Mix/Loop/Pause controls in the active QuipslyStudio bundle.
- Safety truth: no approval state, branch render state, publication state, export artifact, or original media changed. The v006 human-listen gate remains locked.
- Product intent: make the Audio Room useful as a fast producer listening instrument, not just a visual report.

### 2026-07-13 Audio Room conversation-braid checkpoint
- Added a compact `conversation braid` inside the Listening Lens in `apps/QuipslyStudio/Sources/SharedUI/SourceAwareAudioWorkbenchPanel.swift`.
- The braid visually summarizes the focused lens range using existing stem-window RMS data: Charlie, Homer, source, overlap, and quiet space are visible as a compact colored activity strip.
- The braid is interactive: clicking or dragging seeks the same source-aware sequence clock used by the stem cards and mix controls.
- No new editing, audio-decision, approval, render, or publication model was introduced; the braid is a visual readback of existing source-aware truth.
- Verified through `apps/QuipslyStudio/script/build_and_run.sh --verify`; build/launch completed with only existing `WorkspaceView.swift` macOS 14 `onChange(of:perform:)` deprecation warnings.
- Visually inspected the active app at `/tmp/quipsly-audio-room-lens-braid-crop-20260713.png`; the braid renders under the three stem cards in the active QuipslyStudio bundle.
- Safety truth: no approval state, branch render state, publication state, export artifact, or original media changed. The v006 human-listen gate remains locked.
- Product intent: give Charlie and Codex a fast, visual producer read of conversation flow without adding another report page.

### 2026-07-13 Audio Room health-rail checkpoint
- Added a compact focused-range health rail inside the Listening Lens in `apps/QuipslyStudio/Sources/SharedUI/SourceAwareAudioWorkbenchPanel.swift`.
- The rail shows playhead energy for Charlie, Homer, and source audio plus a visual balance ribbon and compact overlap/source/quiet meters for the current lens window.
- This is read-only visualization over existing source-aware stem truth: no approval state, branch render state, publication state, export artifact, or original media changed.
- Verified through `apps/QuipslyStudio/script/build_and_run.sh --verify`; build/launch completed with only existing `WorkspaceView.swift` macOS 14 `onChange(of:perform:)` deprecation warnings.
- Product intent: make the Audio Room feel more like a DAW-grade listening instrument and less like a report page, so Charlie and Codex can discuss sound quality by seeing and hearing it together.

### 2026-07-13 Audio Room listen-first layout checkpoint
- Reordered the Audio Room so the source-aware Listening Lens appears immediately below the whole-episode waveform, before proof-window cards.
- Product stance: listen and inspect the separate Charlie/Homer/source stems first; proof marks are secondary navigation, not the primary experience.
- Verified again through `apps/QuipslyStudio/script/build_and_run.sh --verify`; build/launch completed successfully.

### 2026-07-13 Audio Room lens-ruler checkpoint
- Added a compact DAW-style scrub ruler inside the Listening Lens.
- The ruler shows the focused range endpoints, tick marks, and shared playhead, and clicking or dragging it seeks the same source-aware sequence clock as the waveform cards.
- Verified through `apps/QuipslyStudio/script/build_and_run.sh --verify`; build/launch completed with only existing `WorkspaceView.swift` macOS 14 deprecation warnings.
- Product intent: make focused audio listening feel scrollable, time-aware, and self-explanatory without adding instructions text.

### 2026-07-13 Audio Room lens-shortcuts checkpoint
- Added producer-style keyboard affordances to the Listening Lens: `1` plays Charlie, `2` plays Homer, `3` plays source, `M` plays the focused mix, `L` loops the focused mix, and Space pauses when the lens has focus.
- Split the Listening Lens SwiftUI body into named subviews after the compiler hit a type-checking limit; this keeps the UI easier to evolve instead of becoming another monolithic view expression.
- Verified through `apps/QuipslyStudio/script/build_and_run.sh --verify`; first build exposed the expected `CharacterSet` API correction, second build/launch completed successfully.
- Product intent: make the Audio Room feel more like a real DAW/listening desk with fast keyboard steering, while keeping the separate source-aware stem truth intact.
2026-07-13 19:40:20 MDT | Audio Room: added side-by-side Voice Compare, Space plays live stem mix, visible drag-to-scrub guidance. Build verified via apps/QuipslyStudio/script/build_and_run.sh --verify.

- 2026-07-14 09:58:51 MDT | Product note: preserve timestamp-note work, but move it out of paperwork surfaces and into an editor-native timeline notes / marker tool for audio-video review.

- 2026-07-14 10:08:33 MDT | Audio Room: added Homer Audio Rack stage view for Raw synced -> Clean -> Contribution -> Restore -> Presence -> Delivery. Build verified via apps/QuipslyStudio/script/build_and_run.sh --verify.

- 2026-07-14 10:15:58 MDT | Audio tooling: added apps/QuipslyStudio/script/audio_ai_tool_inventory.sh and audio_stage_render.sh for local model/tool discovery plus repeatable non-destructive audio stage candidates.

- 2026-07-14 10:18:32 MDT | Audio tooling smoke: audio_stage_render.sh now renders all five stage candidates after tightening afftdn to nf=-22 and failing hard on missing stage output. QuipslyStudio build verified again.

- 2026-07-14 10:38:55 MDT | Goal rewritten: Episode 4 Professional Audio Workbench and Producer Path. Focus: make Homer sound great while building reusable staged audio tooling.

- 2026-07-14 10:46:57 MDT | Homer audio: rendered full-length stage candidates from homer-dji-aligned.wav to /Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Audio_Workbench/HomerStageCandidates/20260714-104235-homer-aligned-stage-candidates. Desktop symlink: /Users/wall-e/Desktop/Episode4_Homer_audio_stage_candidates_latest.

- 2026-07-14 11:09:08 MDT | Goal rewritten for replacement: Episode 4 Professional Audio Production Workbench. See docs/quipsly/active-goal-episode-4-professional-audio-production.md.
