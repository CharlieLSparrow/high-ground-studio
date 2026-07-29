# Active Goal: Episode 4 Professional Audio Workbench and Producer Path

_Last rewritten: 2026-07-14_

## Objective

Make Episode 4 sound professionally produced while building the reusable Quipsly audio workflow that can do this again for future episodes. Homer/Scott's track is the proof target: create better audio from his real source, compare stages visibly, and keep the best result usable in both Quipsly Studio and Premiere.

## Product principle

Audio truth should be source-aware, stage-aware, and non-destructive. Originals stay untouched. Equal-length Charlie, Homer, and source/clip stems remain the editor truth. Mixed/mastered files are delivery or audition artifacts, not the only place where the edit lives.

## Current working model

1. Raw synced stems preserve timing and source truth.
2. Clean stages remove obvious mud/noise gently.
3. Contribution/gate stages remove echo/park/background bleed without erasing real laughter, overlap, reactions, or cadence.
4. Restore/enhance stages may use local AI/audio models on duplicate stems only.
5. Presence/tone stages make Homer rich, warm, and level-matched beside Charlie.
6. Delivery stages create podcast/video-ready masters after the stems are good.
7. Quipsly Studio should show this visually in the Audio Room, not as a separate paperwork maze.

## Immediate proof work

- Render Homer stage candidates from the full synced Homer stem.
- Measure each candidate for duration, loudness, peak, silence/voice activity, and rough Charlie/Homer balance where possible.
- Add or improve Audio Room UI so Charlie and Homer can be seen side by side on one clock.
- Make the Homer Audio Rack useful for choosing, auditioning, and eventually promoting a candidate.
- Keep timestamp notes, but move them toward an editor-native marker/timeline notes lane.
- Build project-local tooling for local audio analysis and AI/model experiments.

## Research and install policy

Research as needed during the goal. Install local models/tools when they materially help the audio job and can be wrapped in a repeatable script. Prefer project-local environments and manifests over global/system changes. Do not chase novelty if deterministic DSP solves the problem more reliably.

Candidate tools:

- ffmpeg/ffprobe for deterministic DSP and validation.
- whisper.cpp / whisper-cli and MLX Whisper for local transcription.
- pyloudnorm, librosa, scipy, soundfile, matplotlib for analysis and visual QC.
- DeepFilterNet, RNNoise/arnndn, Demucs, pyannote, or other local models only as non-destructive candidate stages.
- Ollama local LLMs for transcript/edit reasoning, not signal processing.

## Acceptance

- Charlie can open a clear refined Charlie stem in Premiere.
- Homer has multiple full-length staged candidates, with visible metrics and manifest truth.
- The best Homer candidate is not just louder; it is warmer, clearer, more present, and preserves natural speech/reactions.
- The Audio Room gives humans and Codex enough visibility to discuss sound by time, waveform, stem, and stage.
- The next Episode 4 edit can use source-aware refined stems instead of a flattened mystery mix.
- Every output is versioned, reversible, and traceable.
