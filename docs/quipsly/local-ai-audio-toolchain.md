# Quipsly local AI and audio toolchain

_Last updated: 2026-07-14_

## Current local inventory

The Mac currently has the pieces for a useful first local workflow:

- `ffmpeg` and `ffprobe` are installed and should remain the deterministic DSP/probe backbone.
- `whisper-cli` is installed and should be used for fast local transcription experiments.
- `ollama` is installed with several local LLMs, including 70B-class models and `deepseek-r1:32b`.
- Python 3.13 is installed, but the scientific/audio ML packages are not installed in the system interpreter.
- No local `demucs`, `deep-filter`, `pyloudnorm`, `librosa`, `torch`, `mlx`, or `mlx_whisper` package is installed yet.
- Logic Pro Creator Studio is installed. Treat GUI DAWs as human/QA helpers until we intentionally automate them.

Inventory command:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/audio_ai_tool_inventory.sh
```

## Recommended local stack for the M4 MacBook Pro with 48 GB RAM

### 1. Deterministic audio backbone

Use `ffmpeg` for first-class, repeatable transforms:

- `ffprobe` for duration, streams, sample rate, channel layout, loudness preflight.
- `afftdn` for light denoise experiments.
- `arnndn` when we install or create RNNoise-compatible models.
- `agate`, `acompressor`, `alimiter`, `loudnorm`, and `ebur128` for transparent podcast mastering stages.

This stays the spine because every stage can be logged, reproduced, compared, and shipped.

### 2. Local transcription

Use the already-installed `whisper-cli` immediately for local transcript experiments. Add MLX Whisper as the likely Apple Silicon path for faster model work when we set up an isolated Python environment.

### 3. Audio quality and analysis environment

Create a project-local Python environment for audio analysis instead of polluting system Python:

```bash
cd /Users/wall-e/Dev/high-ground-studio
python3 -m venv .venv-audio
source .venv-audio/bin/activate
python -m pip install --upgrade pip
python -m pip install numpy scipy soundfile librosa pyloudnorm matplotlib
```

This gives us loudness, waveform, spectral, silence, overlap, and quality-control dashboards that both Charlie and Codex can read.

### 4. Voice cleanup / enhancement experiments

Candidates to test as non-destructive duplicate stems:

- DeepFilterNet for local speech enhancement/noise suppression.
- Demucs for separation experiments when there is music/clip bleed or mixed sources.
- RNNoise/`arnndn` for lightweight noise suppression if we can source or train an appropriate model.
- dxRevive/Supertone/iZotope-style tools only if we can automate them reliably or use them as human comparison references.

The product rule: never replace the source. Render `raw`, `clean`, `contribution`, `restore`, `presence`, and `delivery` candidates as sidecars, keep recipes in metadata, and let the editor compare them on the same clock.

### 5. Local LLM support

Use Ollama for local reasoning around transcripts, timestamp notes, title ideas, shorts candidates, and edit explanations. Do not use local LLMs for signal processing. They help decide and explain; audio DSP/model stages do the sound work.

## Codex capability boundary

Codex currently does not have a built-in audio equivalent of the image generation/editing tool. I can work with audio by:

- Running local tools like `ffmpeg`, `ffprobe`, `whisper-cli`, Python scripts, and installed model CLIs.
- Building Quipsly UI and agent-accessible controls around audio evidence.
- Creating waveform, loudness, transcript, and stage comparison artifacts.
- Installing and wrapping local models when we choose them.

I cannot directly “listen” like a human from the model context unless we convert audio into evidence: waveforms, spectra, loudness, transcriptions, diarization, similarity checks, and short proof clips for human review.

## Immediate next build path

1. Keep the new Homer Audio Rack in the Audio Room as the visible stage map.
2. Add a stage renderer that outputs equal-length Homer candidates: raw synced, clean, gate/contribution, presence, and delivery preview.
3. Add A/B controls in the Audio Room to switch Homer’s active audition stage without changing source truth.
4. Add metrics per stage: integrated LUFS, short-term loudness, peak, voice activity, noise floor estimate, and Charlie/Homer balance.
5. Use Episode 4 as the proof bed, then generalize to episodes 1-6.

## Key principle

Audio should be professional and visible, not mystical. If a model or filter changes the sound, Quipsly should show what stage did it, preserve the recipe, keep the original safe, and make A/B comparison easy.
