#!/usr/bin/env python3
"""Render a versioned, source-preserving local AI audio stage.

Long recordings are processed as context-padded chunks so model runtimes never
need to hold an entire episode in one tensor. Only each chunk's core interval is
kept, preserving the source clock while giving the model warm-up context at
every boundary.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shutil
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_MODEL_ROOT = (
    Path.home() / "Library/Application Support/Quipsly/Models/DeepFilterNet"
)


def run(command: list[str], *, capture: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        check=True,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
    )


def probe(path: Path) -> dict[str, Any]:
    result = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration,size:stream=codec_name,sample_rate,channels",
            "-of",
            "json",
            str(path),
        ],
        capture=True,
    )
    return json.loads(result.stdout)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while block := handle.read(1024 * 1024):
            digest.update(block)
    return digest.hexdigest()


def combined_model_checksum(model_name: str) -> tuple[str | None, list[str]]:
    model_dir = Path.home() / "Library/Caches/DeepFilterNet" / model_name
    files = sorted(path for path in model_dir.rglob("*") if path.is_file())
    if not files:
        return None, []
    digest = hashlib.sha256()
    for path in files:
        relative = str(path.relative_to(model_dir)).encode()
        digest.update(len(relative).to_bytes(8, "big"))
        digest.update(relative)
        digest.update(bytes.fromhex(sha256(path)))
    return digest.hexdigest(), [str(path) for path in files]


def ffmpeg_extract(
    source: Path,
    output: Path,
    start: float,
    duration: float,
    sample_rate: int,
    channels: int,
) -> list[str]:
    command = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-y",
        "-ss",
        f"{start:.9f}",
        "-t",
        f"{duration:.9f}",
        "-i",
        str(source),
        "-ar",
        str(sample_rate),
        "-ac",
        str(channels),
        "-c:a",
        "pcm_s24le",
        str(output),
    ]
    run(command)
    return command


def ffmpeg_trim(
    source: Path,
    output: Path,
    start: float,
    duration: float,
    sample_rate: int,
    channels: int,
) -> list[str]:
    command = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-y",
        "-ss",
        f"{start:.9f}",
        "-t",
        f"{duration:.9f}",
        "-i",
        str(source),
        "-af",
        "asetpts=N/SR/TB",
        "-ar",
        str(sample_rate),
        "-ac",
        str(channels),
        "-c:a",
        "pcm_s24le",
        str(output),
    ]
    run(command)
    return command


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render a chunked, exact-clock DeepFilterNet audio stage."
    )
    parser.add_argument("input", type=Path, help="Aligned source WAV.")
    parser.add_argument("output", type=Path, help="New versioned output WAV.")
    parser.add_argument(
        "--manifest",
        type=Path,
        help="Output manifest path. Defaults beside the output WAV.",
    )
    parser.add_argument("--model-root", type=Path, default=DEFAULT_MODEL_ROOT)
    parser.add_argument("--model-name", default="DeepFilterNet3")
    parser.add_argument("--atten-limit-db", type=float, default=3.0)
    parser.add_argument("--chunk-seconds", type=float, default=600.0)
    parser.add_argument("--context-seconds", type=float, default=8.0)
    parser.add_argument(
        "--work-root",
        type=Path,
        default=Path.home() / "Library/Caches/Quipsly/AudioAI",
    )
    parser.add_argument("--keep-work", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source = args.input.expanduser().resolve()
    output = args.output.expanduser().resolve()
    manifest_path = (
        args.manifest.expanduser().resolve()
        if args.manifest
        else output.with_suffix(".manifest.json")
    )
    model_root = args.model_root.expanduser().resolve()
    executable = model_root / "venv/bin/deep-filter-py"
    lockfile = model_root / "python-packages.lock.txt"

    if not source.is_file():
        raise SystemExit(f"Input does not exist: {source}")
    if output == source:
        raise SystemExit("Output must not replace the source.")
    for path in (output, manifest_path):
        if path.exists():
            raise SystemExit(f"Refusing to overwrite existing artifact: {path}")
    if not executable.is_file():
        raise SystemExit(f"DeepFilterNet runtime is not installed: {executable}")
    if args.chunk_seconds <= 0 or args.context_seconds < 0:
        raise SystemExit("Chunk length must be positive and context non-negative.")
    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            raise SystemExit(f"Required tool is missing: {tool}")

    source_probe = probe(source)
    stream = source_probe.get("streams", [{}])[0]
    duration = float(source_probe["format"]["duration"])
    sample_rate = int(stream.get("sample_rate") or 48000)
    channels = int(stream.get("channels") or 2)
    chunk_count = math.ceil(duration / args.chunk_seconds)
    started = time.monotonic()
    args.work_root.expanduser().mkdir(parents=True, exist_ok=True)
    temporary = Path(
        tempfile.mkdtemp(prefix="episode-audio-ai-", dir=args.work_root.expanduser())
    )
    raw_dir = temporary / "context-inputs"
    enhanced_dir = temporary / "enhanced"
    core_dir = temporary / "clock-cores"
    for directory in (raw_dir, enhanced_dir, core_dir):
        directory.mkdir(parents=True)

    commands: list[list[str]] = []
    chunks: list[dict[str, Any]] = []
    try:
        raw_paths: list[Path] = []
        for index in range(chunk_count):
            core_start = index * args.chunk_seconds
            core_end = min(duration, (index + 1) * args.chunk_seconds)
            segment_start = max(0.0, core_start - args.context_seconds)
            segment_end = min(duration, core_end + args.context_seconds)
            raw_path = raw_dir / f"chunk-{index:04d}-context.wav"
            commands.append(
                ffmpeg_extract(
                    source,
                    raw_path,
                    segment_start,
                    segment_end - segment_start,
                    sample_rate,
                    channels,
                )
            )
            raw_paths.append(raw_path)
            chunks.append(
                {
                    "index": index,
                    "coreStartSeconds": core_start,
                    "coreEndSeconds": core_end,
                    "contextStartSeconds": segment_start,
                    "contextEndSeconds": segment_end,
                    "trimStartSeconds": core_start - segment_start,
                    "coreDurationSeconds": core_end - core_start,
                }
            )

        model_command = [
            str(executable),
            "-m",
            args.model_name,
            "--atten-lim",
            f"{args.atten_limit_db:g}",
            "--output-dir",
            str(enhanced_dir),
            *[str(path) for path in raw_paths],
        ]
        run(model_command)
        commands.append(model_command)

        core_paths: list[Path] = []
        for chunk, raw_path in zip(chunks, raw_paths, strict=True):
            enhanced_path = enhanced_dir / f"{raw_path.stem}_{args.model_name}.wav"
            if not enhanced_path.is_file():
                raise RuntimeError(f"Model output is missing: {enhanced_path}")
            core_path = core_dir / f"chunk-{chunk['index']:04d}-core.wav"
            commands.append(
                ffmpeg_trim(
                    enhanced_path,
                    core_path,
                    chunk["trimStartSeconds"],
                    chunk["coreDurationSeconds"],
                    sample_rate,
                    channels,
                )
            )
            core_paths.append(core_path)
            chunk["contextInput"] = str(raw_path)
            chunk["modelOutput"] = str(enhanced_path)
            chunk["clockCore"] = str(core_path)

        concat_file = temporary / "concat.txt"
        concat_file.write_text(
            "".join(f"file '{str(path).replace(chr(39), chr(39) * 2)}'\n" for path in core_paths)
        )
        partial = output.parent / f".{output.name}.partial.wav"
        output.parent.mkdir(parents=True, exist_ok=True)
        final_filter = (
            f"apad=whole_dur={duration:.9f},"
            f"atrim=0:{duration:.9f},asetpts=N/SR/TB"
        )
        concat_command = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-nostdin",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat_file),
            "-af",
            final_filter,
            "-ar",
            str(sample_rate),
            "-ac",
            str(channels),
            "-c:a",
            "pcm_s24le",
            str(partial),
        ]
        run(concat_command)
        commands.append(concat_command)
        output_probe = probe(partial)
        output_duration = float(output_probe["format"]["duration"])
        tolerance = max(1.0 / sample_rate, 0.00003)
        if abs(output_duration - duration) > tolerance:
            raise RuntimeError(
                f"Clock mismatch: input={duration:.9f}, output={output_duration:.9f}"
            )
        os.replace(partial, output)

        model_checksum, model_files = combined_model_checksum(args.model_name)
        manifest = {
            "schema": "quipsly.audio-ai-stage.v1",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "source": {
                "path": str(source),
                "sha256": sha256(source),
                "probe": source_probe,
                "mutated": False,
            },
            "output": {
                "path": str(output),
                "sha256": sha256(output),
                "probe": probe(output),
            },
            "model": {
                "name": args.model_name,
                "attenuationLimitDb": args.atten_limit_db,
                "runtime": str(executable),
                "runtimeLockfile": str(lockfile) if lockfile.is_file() else None,
                "runtimeLockSha256": sha256(lockfile) if lockfile.is_file() else None,
                "modelFiles": model_files,
                "modelCombinedSha256": model_checksum,
            },
            "clock": {
                "durationSeconds": duration,
                "sampleRateHz": sample_rate,
                "channels": channels,
                "chunkSeconds": args.chunk_seconds,
                "contextSeconds": args.context_seconds,
                "chunkCount": chunk_count,
                "outputDifferenceSeconds": output_duration - duration,
            },
            "chunks": chunks,
            "commands": commands,
            "elapsedSeconds": time.monotonic() - started,
            "promotionState": "candidate-needs-quality-and-direct-listen-proof",
        }
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
        print(json.dumps({"output": str(output), "manifest": str(manifest_path), "durationSeconds": output_duration, "chunks": chunk_count}, indent=2))
    finally:
        if args.keep_work:
            print(f"Kept work directory: {temporary}")
        else:
            shutil.rmtree(temporary, ignore_errors=True)


if __name__ == "__main__":
    main()
