# Episode 4 Morning Publish Quality Goal

Primary rule: get Episode 4 to the best publishable state possible for Charlie's morning listen and same-day publishing decision.

Current gate: the Episode 4 v006 mastered audio spine is the source-quality gate. Do not render final long-form episode cuts or shorts from it until the spine survives machine checks and Charlie's guarded human listen pass.

Objective:
Make Episode 4 publish-ready for Spotify, Apple Podcasts, YouTube, and shorts by proving the audio spine first, then using that approved spine to produce the best episode and short exports we can.

Audio quality acceptance:
1. Preserve originals. Work from derived/session artifacts only.
2. Keep speaker-aware cleanup intact: Charlie and Homer should both remain present, intelligible, and naturally paced.
3. Prove loudness, true peak, clipping, silence, duration, channel layout, file existence, and manifest consistency.
4. Prove translation survival with review snippets for source WAV, podcast AAC, podcast MP3, and phone/mono-style listening.
5. Require Charlie's morning human listen before branch inheritance and final renders.
6. If Charlie approves the v006 spine, mark the spine as approved and unlock episode/short rendering.
7. If Charlie rejects the spine, capture the exact issue, create the next version, and re-run the quality gauntlet.

Episode/short acceptance after approved spine:
1. Create the strongest Episode 4 long-form edit first, targeting the best natural episode length rather than arbitrary runtime.
2. Export a YouTube-ready video, podcast audio-only file, and platform metadata packet.
3. Create high-quality shorts from the same approved audio/edit truth, prioritizing strong hooks, clear context, visible reactions, and natural cadence.
4. Keep every export versioned. Never overwrite old versions.
5. Keep local export readiness, human approval, and external publication receipt truth separate.
6. Do not publicly upload, schedule, publish, delete, or mutate accounts without Charlie's explicit approval.

Fallback ladder:
1. If the audio spine fails, fix the spine before rendering final episodes or shorts.
2. If one quality method stalls, continue with other non-destructive quality evidence and document the gap.
3. If final publishing credentials or human approval are missing, prepare files, metadata, manifests, and receipt slots without publishing.
4. If Episode 4 reaches a stable publishable candidate, apply the same audio-quality and render-readiness tools to Episodes 1-6.

Research-backed quality methods to keep expanding:
- ITU BS.1770 loudness and true-peak measurement.
- Platform file/spec compliance for Apple Podcasts, Spotify, and YouTube.
- Multi-device translation listening.
- Transcript-assisted intelligibility checks.
- Speaker-balance, cross-talk, gate damage, silence, clipping, and cadence audits.
- Human-listen checklist that is short enough for a tired human after grave shift but strict enough to prevent bad shipping.

Success:
Charlie wakes up to one obvious Episode 4 audio spine to listen to, clear pass/fail instructions, no mystery blockers, and a safe path to publish if it sounds right.

## Current platform-quality anchors checked 2026-07-12

- Apple Podcasts: use the approved spine to generate RSS audio as MP3 or AAC, with Apple recommending AAC/MP4 for RSS efficiency. Keep loudness around -16 dB LKFS with +/- 1 dB tolerance and true peak not above -1 dB FS before encoding.
- Spotify video: final video uploads should be MOV/MPG/MP4 with one video track and one audio track; H.264 High Profile; native frame rate; AAC-LC stereo audio at 192 kbps or higher.
- YouTube: final video uploads should be MP4 with fast-start moov atom, AAC-LC/Opus audio, 48 kHz sample rate, stereo audio, H.264, progressive scan, source-native frame rate, and 16:9 or 9:16 as appropriate.

Quipsly implication: audio-spine quality gates happen before platform render gates. Platform render gates should be separate checks, not mixed into the spine approval signal.
