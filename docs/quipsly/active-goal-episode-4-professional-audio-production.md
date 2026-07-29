# Active Goal: Episode 4 Professional Audio Production Workbench

_Last rewritten: 2026-07-14_

## Objective

Make Episode 4 sound professionally produced while building the reusable Quipsly audio workflow that can do this again. Homer/Scott's audio is the proof target: create warmer, clearer, louder, more natural Homer stems while preserving Charlie's echo-clean stem, source timing, and editor-grade transparency.

## Product truth

Quipsly's audio editor must reduce systems anxiety, not create a paperwork maze. The useful surfaces are beautiful, visual, listenable, and source-aware: waveform lanes, stage racks, A/B listening, timestamp markers, and clear candidate promotion. Reports and manifests exist underneath for Codex and traceability, but the human workflow should happen inside the editor.

## Non-negotiable architecture

- Originals are never mutated.
- Charlie, Homer, and clip/source stems stay equal-length and synced to one sequence clock.
- Separate refined stems are the editorial truth.
- Mixed/mastered files are audition, handoff, or delivery artifacts, not the only source of truth.
- Every audio treatment is a named stage with a recipe, output path, metrics, and rollback path.
- The editor should show what changed through sound and visuals, not through bureaucratic forms.

## Current known useful assets

- Charlie refined dialogue stem is symlinked on the Desktop as:
  `/Users/wall-e/Desktop/Episode4_Charlie_refined_dialogue_stem.wav`
- Homer stage candidates are symlinked on the Desktop as:
  `/Users/wall-e/Desktop/Episode4_Homer_audio_stage_candidates_latest`
- Heavy Podcast media is being migrated from Desktop to external drive, then Desktop will become a symlink to preserve old Premiere paths.

## Immediate work loop

1. Keep the Desktop Podcast migration safe: copy first, verify, final sync, replace with symlink only after no app has files open.
2. Finish Homer stage candidate measurement with fixed metrics parser.
3. Create better Homer candidates as needed: raw synced, clean, contribution/gate, presence, delivery, and optional AI-restored duplicate stems.
4. Use local tools and models where they materially help. Research as needed. Install project-local tooling/models rather than polluting system state.
5. Build the Audio Room toward a professional DAW-like workbench: Charlie/Homer side-by-side, shared playhead, spacebar playback, draggable waveform playhead, stage rack, A/B auditioning, timestamp notes/markers, and visible loudness/quality clues.
6. Make the best Homer stem usable in Quipsly Studio and Premiere.
7. Use the best source-aware stems to produce an Episode 4 edit and upload-ready audio/video once the audio foundation is solid.

## Local AI/audio tooling direction

- Keep ffmpeg/ffprobe as the deterministic DSP and validation backbone.
- Use whisper-cli / whisper.cpp and possibly MLX Whisper for local transcription.
- Use pyloudnorm, librosa, scipy, soundfile, and matplotlib for metrics and visual QC.
- Evaluate DeepFilterNet, RNNoise/arnndn, Demucs, pyannote, MLX tools, and other local models only when they improve the real audio job.
- Use Ollama/local LLMs for transcript/edit reasoning and timestamp-note intelligence, not as signal processors.

## Acceptance

- Homer has at least one full-length refined candidate that is clearly better: warmer, more present, less muted, and still natural.
- Charlie's refined stem remains available and synced.
- The Audio Room makes it easy to compare Charlie/Homer/stage candidates by seeing and hearing them on one clock.
- We can explain exactly what processing created each candidate.
- Episode 4 can proceed to a producer-quality edit using source-aware stems.
- No source media is damaged, overwritten, or silently replaced.
- The process is faster, clearer, and less scary than it was at the start of the day.

## If blocked

- If an AI model install is slow or brittle, continue with deterministic DSP and document the model as an experiment.
- If one candidate sounds bad, preserve it as evidence and generate a better one.
- If full metrics are slow, use quick metrics for iteration and full loudness scans for final candidates.
- If external-drive IO is busy, improve UI/docs/scripts or work on local-light tasks until IO clears.
