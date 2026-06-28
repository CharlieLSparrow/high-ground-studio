#!/usr/bin/env python3
"""Create a resumable Quipsly video proxy in deterministic chunks.

This is intentionally separate from create_proxy_for_file.py. The single-shot
path is still good for normal files; this script is for huge external-drive
camera sources where a full ffmpeg process can stall or get interrupted.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import platform
import shlex
import subprocess
import sys
import uuid
from pathlib import Path

from create_proxy_for_file import (
    ffmpeg_has_encoder,
    is_audio_source,
    proxy_url_for,
    resolve_ffmpeg,
    safe_filename,
)


def ffprobe_duration(ffmpeg: str, source: Path) -> float:
    ffprobe = str(Path(ffmpeg).with_name("ffprobe"))
    if not Path(ffprobe).is_file():
        ffprobe = "ffprobe"
    completed = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(source),
        ],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        timeout=30,
    )
    if completed.returncode != 0:
        raise SystemExit(f"ffprobe failed for {source}: {completed.stderr.strip()}")
    payload = json.loads(completed.stdout)
    duration = float(payload.get("format", {}).get("duration") or 0)
    if not math.isfinite(duration) or duration <= 0:
        raise SystemExit(f"ffprobe returned invalid duration for {source}: {duration}")
    return duration


def video_chunk_command(
    ffmpeg: str,
    source: Path,
    output: Path,
    start: float,
    duration: float,
) -> tuple[list[str], str]:
    requested = os.environ.get("QUIPSLY_PROXY_VIDEO_ENCODER", "auto").strip().lower() or "auto"
    scale = os.environ.get("QUIPSLY_PROXY_VIDEO_SCALE", "640:-2").strip() or "640:-2"
    fps = os.environ.get("QUIPSLY_PROXY_VIDEO_FPS", "15").strip() or "15"
    hwaccel = os.environ.get("QUIPSLY_PROXY_HWACCEL", "").strip().lower()
    use_videotoolbox = requested in {"auto", "videotoolbox", "h264_videotoolbox"}
    if requested == "libx264":
        use_videotoolbox = False
    if use_videotoolbox:
        use_videotoolbox = platform.system() == "Darwin" and ffmpeg_has_encoder(ffmpeg, "h264_videotoolbox")

    common = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-nostdin",
        "-loglevel",
        "error",
    ]
    if hwaccel in {"videotoolbox", "auto"} and platform.system() == "Darwin":
        common.extend(["-hwaccel", "videotoolbox" if hwaccel == "videotoolbox" else "auto"])
    common.extend(
        [
            "-ss",
            f"{start:.3f}",
            "-t",
            f"{duration:.3f}",
            "-i",
            str(source),
            "-map",
            "0:v:0",
            "-an",
            "-vf",
            f"scale={scale},fps={fps}",
            "-reset_timestamps",
            "1",
            "-avoid_negative_ts",
            "make_zero",
        ]
    )

    if use_videotoolbox:
        return common + [
            "-c:v",
            "h264_videotoolbox",
            "-allow_sw",
            "1",
            "-b:v",
            os.environ.get("QUIPSLY_PROXY_VIDEO_BITRATE", "550k"),
            "-maxrate",
            os.environ.get("QUIPSLY_PROXY_VIDEO_MAXRATE", "750k"),
            "-bufsize",
            os.environ.get("QUIPSLY_PROXY_VIDEO_BUFSIZE", "1100k"),
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(output),
        ], "h264_videotoolbox"

    return common + [
        "-c:v",
        "libx264",
        "-preset",
        os.environ.get("QUIPSLY_PROXY_X264_PRESET", "veryfast"),
        "-crf",
        os.environ.get("QUIPSLY_PROXY_X264_CRF", "32"),
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(output),
    ], "libx264"


def run_command(cmd: list[str], timeout: float) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=timeout if timeout and timeout > 0 else None,
        check=False,
    )


def concat_chunks(ffmpeg: str, chunks: list[Path], output: Path, timeout: float) -> None:
    concat_file = output.parent / f".{output.stem}-concat-{uuid.uuid4().hex}.txt"
    tmp = output.with_name(f".{output.stem}.concat-partial-{uuid.uuid4().hex}.mp4")
    try:
        concat_file.write_text(
            "\n".join(f"file {shlex.quote(str(chunk))}" for chunk in chunks) + "\n",
            encoding="utf-8",
        )
        completed = run_command(
            [
                ffmpeg,
                "-y",
                "-hide_banner",
                "-nostdin",
                "-loglevel",
                "error",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(concat_file),
                "-c",
                "copy",
                "-movflags",
                "+faststart",
                str(tmp),
            ],
            timeout,
        )
        if completed.returncode != 0:
            raise SystemExit(f"concat failed: {completed.stdout.strip()}")
        if output.exists():
            output.unlink()
        tmp.replace(output)
    finally:
        if concat_file.exists():
            concat_file.unlink()
        if tmp.exists():
            tmp.unlink()


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a resumable Quipsly video proxy from deterministic chunks.")
    parser.add_argument("source", help="Absolute path to the source video")
    parser.add_argument("--root", default=os.environ.get("QUIPSLY_MEDIA_VAULT", str(Path.home() / "Library/Application Support/Quipsly/MediaVault")))
    parser.add_argument("--ffmpeg", default=os.environ.get("QUIPSLY_FFMPEG_PATH"))
    parser.add_argument("--chunk-seconds", type=float, default=float(os.environ.get("QUIPSLY_PROXY_CHUNK_SECONDS", "600")))
    parser.add_argument("--timeout-per-chunk", type=float, default=float(os.environ.get("QUIPSLY_PROXY_CHUNK_TIMEOUT_SECONDS", "900")))
    parser.add_argument("--concat-timeout", type=float, default=float(os.environ.get("QUIPSLY_PROXY_CONCAT_TIMEOUT_SECONDS", "1800")))
    parser.add_argument("--max-chunks", type=int, default=0, help="Process only this many missing chunks, then stop. 0 means all chunks.")
    parser.add_argument("--force", action="store_true", help="Regenerate existing chunks and final proxy.")
    parser.add_argument("--concat-only", action="store_true", help="Only concatenate if all chunks already exist.")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    source = Path(args.source)
    if not source.is_file():
        raise SystemExit(f"Missing source file: {source}")
    if is_audio_source(source):
        raise SystemExit("Chunked proxy currently supports video sources only. Use create_proxy_for_file.py for audio.")
    if args.chunk_seconds <= 0:
        raise SystemExit("--chunk-seconds must be positive")

    root = Path(args.root)
    output = proxy_url_for(source, root)
    output.parent.mkdir(parents=True, exist_ok=True)
    chunk_label = f"{args.chunk_seconds:g}s".replace(".", "p")
    chunk_dir = output.parent / f".{output.stem}_chunks_{chunk_label}"
    chunk_dir.mkdir(parents=True, exist_ok=True)

    ffmpeg = resolve_ffmpeg(args.ffmpeg)
    duration = ffprobe_duration(ffmpeg, source)
    total_chunks = int(math.ceil(duration / args.chunk_seconds))
    safe_base = safe_filename(source.stem)
    chunk_paths = [chunk_dir / f"{safe_base}_chunk_{index:04d}.mp4" for index in range(total_chunks)]

    processed = []
    skipped_existing = []
    errors = []
    encoder = "unknown"

    for index, chunk_path in enumerate(chunk_paths):
        if args.concat_only:
            break
        if chunk_path.exists() and chunk_path.stat().st_size > 0 and not args.force:
            skipped_existing.append(index)
            continue
        if args.max_chunks and len(processed) >= args.max_chunks:
            break
        start = index * args.chunk_seconds
        chunk_duration = min(args.chunk_seconds, max(0.0, duration - start))
        tmp = chunk_path.with_name(f".{chunk_path.stem}.partial-{uuid.uuid4().hex}.mp4")
        cmd, encoder = video_chunk_command(ffmpeg, source, tmp, start, chunk_duration)
        try:
            completed = run_command(cmd, args.timeout_per_chunk)
        except subprocess.TimeoutExpired as error:
            if tmp.exists():
                tmp.unlink()
            errors.append({"chunkIndex": index, "start": start, "duration": chunk_duration, "error": f"chunk timed out after {args.timeout_per_chunk:g}s", "diagnostic": str(error)})
            break
        if completed.returncode != 0:
            if tmp.exists():
                tmp.unlink()
            errors.append({"chunkIndex": index, "start": start, "duration": chunk_duration, "error": "ffmpeg chunk failed", "diagnostic": completed.stdout.strip()})
            break
        if chunk_path.exists():
            chunk_path.unlink()
        tmp.replace(chunk_path)
        processed.append(index)

    ready_chunks = [path for path in chunk_paths if path.exists() and path.stat().st_size > 0]
    complete = len(ready_chunks) == len(chunk_paths)
    concatenated = False
    if complete:
        if args.force or not output.exists() or output.stat().st_size <= 0:
            concat_chunks(ffmpeg, chunk_paths, output, args.concat_timeout)
            concatenated = True

    first_missing = next((index for index, path in enumerate(chunk_paths) if not path.exists() or path.stat().st_size <= 0), None)
    payload = {
        "source": str(source),
        "proxy": str(output),
        "chunkDirectory": str(chunk_dir),
        "durationSeconds": duration,
        "chunkSeconds": args.chunk_seconds,
        "totalChunks": total_chunks,
        "readyChunks": len(ready_chunks),
        "processedChunks": processed,
        "skippedExistingChunks": skipped_existing,
        "firstMissingChunk": first_missing,
        "complete": complete,
        "concatenated": concatenated,
        "proxyExists": output.exists(),
        "proxyBytes": output.stat().st_size if output.exists() else 0,
        "encoder": encoder,
        "errors": errors,
    }
    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(output if complete else chunk_dir)
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
