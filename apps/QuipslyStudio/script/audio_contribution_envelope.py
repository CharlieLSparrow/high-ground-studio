#!/usr/bin/env python3
"""Generate inspectable, non-destructive voice-contribution metadata.

This tool never rewrites the source stem. It decodes a temporary 16 kHz mono
analysis copy, runs Silero VAD, and emits high-resolution probabilities plus
signal-level context. Downstream tools may audition gain envelopes built from
this metadata, but no row is an automatic mute decision.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import shutil
import subprocess
import tempfile
from collections import Counter
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf
import torch
from silero_vad import get_speech_timestamps, load_silero_vad


ANALYSIS_SAMPLE_RATE = 16_000
MODEL_WINDOW_SAMPLES = 512
MODEL_WINDOW_SECONDS = MODEL_WINDOW_SAMPLES / ANALYSIS_SAMPLE_RATE
AGGREGATE_WINDOWS = 3


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create source-preserving speech/activity metadata for one audio stem."
    )
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--episode", required=True)
    parser.add_argument("--speaker", required=True)
    parser.add_argument("--profile", default="silero-vad-v6.2.1-contribution-v1")
    parser.add_argument("--start", type=float, default=0.0)
    parser.add_argument("--duration", type=float)
    parser.add_argument("--speech-threshold", type=float, default=0.50)
    parser.add_argument("--possible-speech-threshold", type=float, default=0.25)
    parser.add_argument("--event-floor-dbfs", type=float, default=-38.0)
    parser.add_argument("--quiet-floor-dbfs", type=float, default=-55.0)
    parser.add_argument("--quiet-probability", type=float, default=0.12)
    return parser.parse_args()


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, check=True, text=True, capture_output=True)


def require_executable(name: str) -> str:
    executable = shutil.which(name)
    if not executable:
        raise RuntimeError(f"Required executable is missing from PATH: {name}")
    return executable


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def probe(path: Path, ffprobe: str) -> dict[str, Any]:
    result = run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration,size:stream=codec_name,sample_rate,channels",
            "-of",
            "json",
            str(path),
        ]
    )
    return json.loads(result.stdout)


def decode_analysis_copy(
    source: Path,
    destination: Path,
    ffmpeg: str,
    start: float,
    duration: float | None,
) -> None:
    command = [ffmpeg, "-nostdin", "-v", "error"]
    if start > 0:
        command.extend(["-ss", f"{start:.6f}"])
    command.extend(["-i", str(source)])
    if duration is not None:
        command.extend(["-t", f"{duration:.6f}"])
    command.extend(
        [
            "-vn",
            "-ac",
            "1",
            "-ar",
            str(ANALYSIS_SAMPLE_RATE),
            "-c:a",
            "pcm_s16le",
            "-y",
            str(destination),
        ]
    )
    run(command)


def dbfs(samples: np.ndarray) -> float:
    if samples.size == 0:
        return -96.0
    rms = float(np.sqrt(np.mean(np.square(samples, dtype=np.float64))))
    return max(-96.0, 20.0 * math.log10(max(rms, 1e-12)))


def classify(
    probability: float,
    level_dbfs: float,
    args: argparse.Namespace,
) -> str:
    if probability >= args.speech_threshold:
        return "speech"
    if probability >= args.possible_speech_threshold:
        return "possible_speech"
    if level_dbfs >= args.event_floor_dbfs:
        return "preserve_non_speech_event"
    if probability <= args.quiet_probability and level_dbfs <= args.quiet_floor_dbfs:
        return "quiet_attenuation_candidate"
    return "review"


def model_probability(model: Any, samples: np.ndarray) -> float:
    tensor = torch.from_numpy(samples.astype(np.float32, copy=False))
    value = model(tensor, ANALYSIS_SAMPLE_RATE)
    return float(value.item())


def analyze_probabilities(
    waveform: np.ndarray,
    model: Any,
    clock_start: float,
    args: argparse.Namespace,
) -> list[dict[str, Any]]:
    model.reset_states()
    rows: list[dict[str, Any]] = []
    probability_bucket: list[float] = []
    sample_bucket: list[np.ndarray] = []
    bucket_start_sample = 0

    for position in range(0, waveform.size, MODEL_WINDOW_SAMPLES):
        source_window = waveform[position : position + MODEL_WINDOW_SAMPLES]
        model_window = source_window
        if source_window.size < MODEL_WINDOW_SAMPLES:
            model_window = np.pad(
                source_window,
                (0, MODEL_WINDOW_SAMPLES - source_window.size),
                mode="constant",
            )
        probability_bucket.append(model_probability(model, model_window))
        sample_bucket.append(source_window)

        is_last = position + MODEL_WINDOW_SAMPLES >= waveform.size
        if len(probability_bucket) < AGGREGATE_WINDOWS and not is_last:
            continue

        bucket_samples = np.concatenate(sample_bucket) if sample_bucket else np.array([])
        start_seconds = clock_start + bucket_start_sample / ANALYSIS_SAMPLE_RATE
        end_sample = min(position + MODEL_WINDOW_SAMPLES, waveform.size)
        end_seconds = clock_start + end_sample / ANALYSIS_SAMPLE_RATE
        probability_mean = float(np.mean(probability_bucket))
        probability_max = float(np.max(probability_bucket))
        level_dbfs = dbfs(bucket_samples)
        rows.append(
            {
                "start": round(start_seconds, 6),
                "end": round(end_seconds, 6),
                "speechProbabilityMean": round(probability_mean, 6),
                "speechProbabilityMax": round(probability_max, 6),
                "rmsDbfs": round(level_dbfs, 3),
                "classification": classify(probability_max, level_dbfs, args),
            }
        )
        probability_bucket = []
        sample_bucket = []
        bucket_start_sample = end_sample

    return rows


def speech_segments(
    waveform: np.ndarray,
    model: Any,
    clock_start: float,
    args: argparse.Namespace,
) -> list[dict[str, float]]:
    model.reset_states()
    tensor = torch.from_numpy(waveform.astype(np.float32, copy=False))
    detected = get_speech_timestamps(
        tensor,
        model,
        threshold=args.speech_threshold,
        sampling_rate=ANALYSIS_SAMPLE_RATE,
        min_speech_duration_ms=160,
        min_silence_duration_ms=280,
        speech_pad_ms=120,
        return_seconds=True,
    )
    return [
        {
            "start": round(clock_start + float(item["start"]), 6),
            "end": round(clock_start + float(item["end"]), 6),
        }
        for item in detected
    ]


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fieldnames = [
        "start",
        "end",
        "speechProbabilityMean",
        "speechProbabilityMax",
        "rmsDbfs",
        "classification",
    ]
    temporary = path.with_suffix(path.suffix + ".partial")
    with temporary.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    os.replace(temporary, path)


def write_json(path: Path, payload: Any) -> None:
    temporary = path.with_suffix(path.suffix + ".partial")
    temporary.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def main() -> int:
    args = parse_args()
    source = args.input.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    if output_dir.exists() and any(output_dir.iterdir()):
        raise FileExistsError(f"Refusing to overwrite non-empty output directory: {output_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)

    ffmpeg = require_executable("ffmpeg")
    ffprobe = require_executable("ffprobe")
    source_probe = probe(source, ffprobe)
    source_checksum = sha256(source)

    with tempfile.TemporaryDirectory(prefix="quipsly-audio-activity-") as temporary:
        analysis_wav = Path(temporary) / "analysis.wav"
        decode_analysis_copy(source, analysis_wav, ffmpeg, args.start, args.duration)
        waveform, sample_rate = sf.read(analysis_wav, dtype="float32", always_2d=False)
        if sample_rate != ANALYSIS_SAMPLE_RATE:
            raise RuntimeError(f"Analysis decode has unexpected sample rate: {sample_rate}")
        if waveform.ndim != 1:
            waveform = np.mean(waveform, axis=1, dtype=np.float32)

        model = load_silero_vad()
        rows = analyze_probabilities(waveform, model, args.start, args)
        segments = speech_segments(waveform, model, args.start, args)

    probability_csv = output_dir / "speech-probability-100ms.csv"
    segments_json = output_dir / "speech-segments.json"
    write_csv(probability_csv, rows)
    write_json(segments_json, {"segments": segments})

    counts = Counter(row["classification"] for row in rows)
    analyzed_duration = waveform.size / ANALYSIS_SAMPLE_RATE
    manifest = {
        "schema": "quipsly.audio-contribution-envelope.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "episode": args.episode,
        "speaker": args.speaker,
        "profile": args.profile,
        "intent": "Measure likely voice contribution and preserve uncertain human sounds without mutating the stem.",
        "source": {
            "path": str(source),
            "sha256": source_checksum,
            "probe": source_probe,
            "mutated": False,
        },
        "analysis": {
            "clockStartSeconds": args.start,
            "durationSeconds": round(analyzed_duration, 6),
            "sampleRate": ANALYSIS_SAMPLE_RATE,
            "modelWindowSeconds": MODEL_WINDOW_SECONDS,
            "aggregateWindowSeconds": MODEL_WINDOW_SECONDS * AGGREGATE_WINDOWS,
            "speechThreshold": args.speech_threshold,
            "possibleSpeechThreshold": args.possible_speech_threshold,
            "eventFloorDbfs": args.event_floor_dbfs,
            "quietFloorDbfs": args.quiet_floor_dbfs,
            "quietProbability": args.quiet_probability,
            "classificationCounts": dict(sorted(counts.items())),
            "speechSegmentCount": len(segments),
            "automaticMuteDecisions": 0,
        },
        "runtime": {
            "sileroVad": version("silero-vad"),
            "torch": torch.__version__,
            "numpy": np.__version__,
            "soundfile": version("soundfile"),
        },
        "artifacts": {
            "probabilityCsv": {
                "path": str(probability_csv),
                "sha256": sha256(probability_csv),
            },
            "speechSegmentsJson": {
                "path": str(segments_json),
                "sha256": sha256(segments_json),
            },
        },
        "interpretation": {
            "speech": "High-confidence speech; preserve.",
            "possible_speech": "Possible low-level speech; preserve pending review.",
            "preserve_non_speech_event": "Audible non-speech event such as laughter, breath, impact, or movement; preserve pending event classification.",
            "quiet_attenuation_candidate": "Quiet, low-speech-probability region eligible for conservative auditioning, never automatic deletion.",
            "review": "Ambiguous region; inspect before applying gain automation.",
        },
    }
    write_json(output_dir / "manifest.json", manifest)
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
