# Quipsly Audio Workbench research sprint

Date: 2026-07-10

## Product thesis

Quipsly should become unusually good at turning imperfect, disjointed podcast recordings into a polished, human-sounding production without hiding the process. The winning architecture is not a single "enhance audio" button. It is a source-aware audio workbench:

1. preserve raw sources
2. align sources to one sequence timeline
3. diagnose source health
4. identify speaker/source activity
5. clean each derived stem
6. compare short restoration/profile candidates
7. mix and master a normal stereo spine
8. keep stage receipts so every failure can be traced

## Relevant market patterns

### Auphonic

Auphonic validates the multitrack direction: it emphasizes speaker balancing, adaptive leveling, multitrack ducking, adaptive noise gates, mic bleed removal, loudness targets, transcript integration, and export formats.

Quipsly implication:

- Build source-aware multitrack intelligence first.
- Let users/Codex inspect which speaker/source is active.
- Treat silence/filler/cough removal as edit metadata, not destructive source mutation.
- Keep loudness targets as configurable delivery outputs.

Useful reference:

- [Auphonic features](https://auphonic.com/features)

### Descript

Descript validates the user-facing expectation that modern editors should clean audio, reduce echo/noise, remove filler, duck layers, and make transcript-driven editing feel accessible.

Quipsly implication:

- Studio Sound style restoration is a user expectation, but Quipsly should expose its stages instead of hiding them.
- Descript's "lower audio of other layers" note is useful as a warning: clip-presence ducking is not the same as audio-content/speaker-aware ducking.
- Transcript awareness should support editing and proofing, not become a brittle official approval bureaucracy.

Useful references:

- [Descript Studio Sound](https://help.descript.com/hc/en-us/articles/10327603613837-Studio-Sound)
- [Descript lower audio of other layers](https://help.descript.com/hc/en-us/articles/10327507829773-Lower-audio-of-other-layers)

### Adobe Podcast / Enhance Speech

Adobe's Enhance Speech validates that users expect one-click cleanup, noise/artifact filtering, pitch/volume adjustment, and normalization. It also reinforces that better inputs produce better outputs.

Quipsly implication:

- Use AI restoration as a treatment candidate, not the only source of truth.
- Keep before/after proof windows because enhancement quality depends on the source condition.
- Prefer per-stem restoration before final mix restoration when separated stems exist.

Useful reference:

- [Adobe Podcast FAQ](https://helpx.adobe.com/podcast/adobe-podcast-faq.html)

### FFmpeg

FFmpeg gives us durable local primitives for the transparent stages:

- `astats` and `ebur128` for measurement
- `loudnorm` for loudness normalization
- `agate`, `sidechaincompress`, `afftdn`, `highpass`, `lowpass`, `acompressor`, and `alimiter` for conservative automated cleanup
- `silencedetect` and `asetnsamples` for activity/inspection packets

Quipsly implication:

- Use FFmpeg for deterministic QC and baseline automation.
- Keep high-value AI/restoration tools optional and stage-bounded.
- Generate machine-readable reports for every stem and output.

Useful reference:

- [FFmpeg filters documentation](https://ffmpeg.org/ffmpeg-filters.html)

### Apple Podcasts, Spotify, and YouTube

Delivery requirements reinforce that Quipsly needs normal, platform-compatible exports, not clever internal diagnostics as user handoff.

Quipsly implication:

- Final handoff should remain normal stereo audio/video files.
- Speaker splits, activity maps, and restoration candidates belong beside the master as diagnostics.
- Keep podcast audio and video platform specs in the publishing layer.

Useful references:

- [Apple Podcasts audio requirements](https://podcasters.apple.com/support/893-audio-requirements)
- [Spotify for Creators audio publishing](https://support.spotify.com/us/creators/article/publishing-audio-episodes/)
- [Spotify for Creators video specs](https://support.spotify.com/us/creators/article/publishing-videos/)
- [YouTube recommended upload encoding settings](https://support.google.com/youtube/answer/1722171)

## Engineering decision

Build the next Audio Workbench pass around profile-variant proof windows:

1. Create a source activity map for the current baseline.
2. Pick suspicious windows from the map.
3. Render only those windows through multiple treatment profiles:
   - conservative
   - standard
   - aggressive rescue
4. Compare raw aligned, source-aware mix, treatment candidates, and mastered candidate.
5. Promote the best profile to a new full baseline version.

This prevents the old failure mode: render a full magic output, discover Homer disappeared or Charlie echo remains, then guess which filter caused it.

## Current Episode 4 finding

The first source-activity map for `episode-4-conformed-production-baseline-v005` shows the right kind of evidence but not yet enough confidence:

- Charlie energy retention is relatively healthy.
- Homer contribution appears materially reduced compared with Homer aligned source.
- The report flagged hundreds of Homer overgate/loss-risk windows.
- This does not prove the v005 spine is bad, but it does prove the next pass should test Homer-preserving profile variants before another full render.

Artifacts:

- `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/audio-workbench-source-activity-v005.md`
- `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/audio-workbench-source-activity-v005.csv`

## Next build recommendation

Build `audio_workbench_profile_variants.py`:

- reads the source activity map
- picks representative risk windows
- renders conservative/standard/aggressive treatment snippets only for those windows
- writes a variant comparison manifest and markdown
- does not create a new full baseline until a profile is chosen

This is the fastest route toward AAA quality without making a new pile of opaque audio goblin artifacts.

## Implemented after research

Implemented:

- `apps/QuipslyStudio/script/audio_workbench_source_activity.py`
- `apps/QuipslyStudio/script/audio_workbench_profile_variants.py`
- `apps/QuipslyStudio/script/audio_workbench_variant_qc.py`

Current corrected Episode 4 proof packet:

- variants: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-variants-v005-20260710-024506/audio-workbench-profile-variants-v005.md`
- QC board: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-variants-v005-20260710-024506/audio-workbench-profile-variant-qc.md`
- playlist: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-variants-v005-20260710-024506/audio-workbench-profile-variant-listen-proof.m3u`

Machine QC result:

- `homer-preserving-clean`, `conservative-human`, and `aggressive-rescue` all rendered cleanly as 48 kHz proof clips.
- `homer-preserving-clean` is the preferred first listen candidate because the source-activity map flagged Homer retention risk.
- Machine QC does not authorize auto-promotion. The next step is listen proof, then a new full v006 baseline if the profile earns it.

## Rendered candidate checkpoint

After the proof-window pass, Quipsly rendered a full candidate:

- baseline id: `episode-4-conformed-production-baseline-v006-candidate-homer-preserving-clean`
- profile: `homer-preserving-clean`
- folder: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310`
- handoff WAV: `episode4-mastered-audio-spine-v006.wav`
- listening M4A: `episode4-mastered-audio-spine-v006.m4a`
- review packet: `audio-listen-review-packet-v006-candidate-homer-preserving-clean.md`

The render remains a machine candidate. QC proves file integrity, duration, sample rate, loudness, true peak, and obvious silence warnings. It does not prove the audio feels natural. Human listen proof is still required before this becomes the inherited production baseline for edit branches.

## 2026-07-12 stronger quality-methods update

The current target is the Episode 4 high-quality audio spine, not the final YouTube episode or shorts. Final episodes and shorts inherit from the spine only after the spine passes machine checks and a guarded human listen.

Stronger quality determination should be layered:

1. Platform delivery compliance. Keep measuring file shape, sample rate, codec, loudness, true peak, duration spread, and reviewable handoff paths.
2. Speaker survival and source balance. Keep proving that Charlie and Homer both survive cleanup and that bleed suppression does not erase reactions or natural overlap.
3. Perceptual speech-quality scoring. Add optional NISQA/DNSMOS-style scoring as a routing signal for noise, coloration, discontinuity, speech quality, background quality, and overall quality. These scores should create listen-priority windows, not approval.
4. Transcript and source-audio agreement. Compare ASR output from raw sources, cleaned stems, and the mastered spine to catch dropped speaker content, severe intelligibility drops, or source mismatch.
5. Device-translation audition. Render short review reels through mono fold-down, phone/laptop speaker approximation, small-speaker EQ, and noisy-context checks so the master is not only studio-headphone good.
6. Source-leakage regression. Promote echo-under-active-speaker, room-noise-under-active-speaker, overgate, preserved-overlap, and reaction-survival checks into a dedicated regression board.
7. Cadence and edit-flow naturalness. Treat this as final-episode quality, not audio-spine quality. It must include jump-cut density, L/J cut opportunities, reaction-shot coverage, silence rhythm, and transcript continuity.
8. Shorts hook quality. Treat this as final-shorts quality, not audio-spine quality. Score the first-three-second hook, standalone thought arc, caption density, face/framing safety, platform fit, and cut rhythm.

Implementation status:

- `audio_workbench_quality_methods_matrix.py` now records these stronger methods in the current control plane.
- Current v006 remains machine-ready for Charlie's human listen, not publication-approved.
- Episode 4 remains the rule: approve or repair the audio spine first, then render branch episodes/shorts, then reuse the proven profile across Episodes 1-6.

## Listen-proof bundle checkpoint

To make the v006 candidate easier to review without hunting through work folders, Quipsly now creates a local listen-proof bundle beside the candidate:

- bundle: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/listen-proof-bundle-v006-candidate-homer-preserving-clean-20260710-034749`
- reviewer page: `listen-proof.html`
- playlist: `listen-proof.m3u`
- bundle manifest: `listen-proof-bundle.json`
- item count: `14`
- symlink validation: `0` broken links

The bundle includes full WAV/M4A handoffs plus ordered proof windows for raw parent evidence, v006 source-aware candidate audio, v006 mastered candidate audio, and speaker-split diagnostics. It is a reviewer convenience layer, not a publication approval.

The listen-review packet for v006 now acts as the reviewer front desk. It records the normal handoff WAV/M4A, listen-proof HTML/playlist, source activity report, quality report, source contribution report, stage board, and a pass/fail checklist. The packet still leaves `publicationApproved` false because machine evidence cannot prove that the conversation feels natural.

Quipsly also generated a timestamped human listen-decision template:

- decision template: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-listen-decision-v006-candidate-homer-preserving-clean-20260710-040943.md`
- decision status: `pending-human-listen`
- checklist count: `8`
- proof window count: `3`
- publication approved: `false`

This is the artifact a human reviewer can fill in to promote v006 for branch inheritance or request a v007/timestamped candidate with exact failure notes.

Quipsly also generated a proof-window comparison:

- comparison: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-proof-window-comparison-v006-candidate-homer-preserving-clean.md`
- warning count: `5`
- warning meaning: numerical listen-priority clues, not automatic rejection

The comparison checks raw aligned evidence, candidate source-aware mix, candidate master, and speaker-split diagnostics. It is meant to catch likely missing-source, over-mastering, or one-sided diagnostic problems before a reviewer spends attention on the candidate.

Quipsly also generated a branch-inheritance gate:

- gate: `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-branch-inheritance-gate-v006-candidate-homer-preserving-clean-20260710-043334.md`
- can inherit for branches: `false`
- artifact check failures: none
- blocker: `human listen proof pending: decisionStatus=pending-human-listen`
- advisory: a long synchronized-spine silence around `1760.0s` should be reviewed or skipped by final edit branches

This gate is intentionally strict. It prevents long-form or shorts renders from accidentally treating a machine-clean audio candidate as a human-approved production baseline.

The listen-decision recorder is now available at `apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py`. A dry-run approval command was validated against v006, and manifest truth remained unchanged: `approvalStatus` stayed `machine-candidate-needs-human-listen-proof`, `branchInheritanceReady` stayed `false`, and no final listen-decision artifact was written. The latest decision template is `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310/audio-listen-decision-v006-candidate-homer-preserving-clean-20260710-043334.md`.

## 2026-07-10 listen workorder refinement

A numerical proof-window comparison is useful only when it creates a human or agent action. The v006 Episode 4 candidate now generates a proof-window listen workorder that translates warning strings into:

- the exact proof window to open
- what to listen for
- pass and fail conditions
- the likely failing stage
- the safest v007 or timestamped repair action

This preserves the Quipsly rule: transparent evidence first, no fake certainty, no black-box approval. Large level deltas and speaker-split imbalances are listen-priority clues, not automatic failures. Branch inheritance should stay blocked until a real listen decision records that the candidate passed in context.

## 2026-07-12 quality ladder hardening

The quality matrix now separates three different release decisions instead of letting one score do too much work:

1. Audio spine quality: can the v006 mastered conversation become the inherited production spine?
2. Final long-form episode quality: can the episode be watched or heard as a finished edit with intentional pacing, reactions, source clips, and platform-safe audio?
3. Shorts and social-clip quality: can a clip stand alone, hook quickly, remain intelligible, frame faces safely, and justify posting?

Research-backed references are now registered in the matrix so future agents do not have to rediscover the target logic:

- ITU-R BS.1770: loudness and true-peak measurement base.
- EBU R 128: integrated loudness, loudness range, and true-peak discipline.
- Apple Podcasts audio requirements: podcast handoff expectations and level safety.
- Spotify supported audio episode formats: MP3/M4A/WAV packaging support.
- Spotify loudness normalization: downstream streaming reference for video/social auditioning, not the current podcast-spine approval target.
- DNSMOS P.835: future no-reference speech-quality routing signal for speech, background, and overall quality.

Most important rule: audio-spine readiness remains narrower than final episode readiness. A strong v006 spine can unlock branch work after guarded human approval, but it does not prove pacing, clip insertion, cuts, shorts hook quality, publication receipts, or platform performance.

