#!/usr/bin/env python3
"""Analyze an exported Quipsly short for objective audio sanity signals.

This does not approve a short. It catches boring-but-deadly problems before a
human or agent spends attention on creative review: no audio stream, wrong-ish
duration, long silence, extremely low volume, or clipping risk.
"""
from __future__ import annotations

import json
import math
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


def resolve_tool(name: str, env_key: str) -> str | None:
    env_value = os.environ.get(env_key, "").strip()
    if env_value and os.access(env_value, os.X_OK):
        return env_value
    found = shutil.which(name)
    if found:
        return found
    for candidate in (f"/opt/homebrew/bin/{name}", f"/usr/local/bin/{name}"):
        if os.access(candidate, os.X_OK):
            return candidate
    return None


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)


def fail(message: str, *, path: str = "", details: dict[str, Any] | None = None) -> int:
    payload = {
        "model": "quipsly-short-audio-sanity",
        "version": "2026-06-19.short-audio-sanity.v1",
        "status": "error",
        "path": path,
        "safeForListenThrough": False,
        "message": message,
        "details": details or {},
        "truth": "Audio sanity is objective preflight only. It does not mark listen-through complete, keep, reject, or publish.",
    }
    print(json.dumps(payload, indent=2))
    return 1


def ffprobe(path: Path, ffprobe_bin: str) -> dict[str, Any]:
    result = run([
        ffprobe_bin,
        "-v", "error",
        "-show_format",
        "-show_streams",
        "-of", "json",
        str(path),
    ])
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "ffprobe failed")
    return json.loads(result.stdout or "{}")


def parse_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def collect_astats(path: Path, duration_limit: float, ffmpeg_bin: str) -> dict[str, Any]:
    # Analyze only the selected short derivative. These are short exports, not raw episodes.
    limit = max(0.1, min(duration_limit, 120.0))
    result = run([
        ffmpeg_bin,
        "-hide_banner",
        "-nostats",
        "-t", f"{limit:.3f}",
        "-i", str(path),
        "-map", "0:a:0",
        "-af", "astats=metadata=1:reset=0",
        "-f", "null",
        "-",
    ])
    text = (result.stderr or "") + "\n" + (result.stdout or "")
    values: dict[str, Any] = {"returnCode": result.returncode}
    patterns = {
        "rmsLevelDb": r"RMS level dB:\s*([-+]?inf|[-+]?\d+(?:\.\d+)?)",
        "peakLevelDb": r"Peak level dB:\s*([-+]?inf|[-+]?\d+(?:\.\d+)?)",
        "maxLevel": r"Max level:\s*([-+]?\d+(?:\.\d+)?)",
        "minLevel": r"Min level:\s*([-+]?\d+(?:\.\d+)?)",
    }
    for key, pattern in patterns.items():
        matches = re.findall(pattern, text, flags=re.IGNORECASE)
        if matches:
            raw = matches[-1]
            if raw.lower().endswith("inf"):
                values[key] = raw
            else:
                values[key] = parse_float(raw)
    if result.returncode != 0:
        values["warning"] = (result.stderr or result.stdout or "ffmpeg astats failed").strip()[-1200:]
    return values


def collect_silence(path: Path, duration: float, ffmpeg_bin: str) -> dict[str, Any]:
    result = run([
        ffmpeg_bin,
        "-hide_banner",
        "-nostats",
        "-i", str(path),
        "-map", "0:a:0",
        "-af", "silencedetect=noise=-42dB:d=0.75",
        "-f", "null",
        "-",
    ])
    text = (result.stderr or "") + "\n" + (result.stdout or "")
    starts = [parse_float(item) for item in re.findall(r"silence_start:\s*([0-9.]+)", text)]
    ends = [parse_float(item) for item in re.findall(r"silence_end:\s*([0-9.]+)", text)]
    durations = [parse_float(item) for item in re.findall(r"silence_duration:\s*([0-9.]+)", text)]
    durations = [item for item in durations if item is not None]
    return {
        "returnCode": result.returncode,
        "silenceEventCount": len(durations),
        "longestSilenceSeconds": max(durations) if durations else 0,
        "totalDetectedSilenceSeconds": sum(durations) if durations else 0,
        "starts": [item for item in starts if item is not None][:20],
        "ends": [item for item in ends if item is not None][:20],
    }


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        return fail("Usage: analyze_short_audio_sanity.py /path/to/exported-short.mp4 [expected-duration-seconds]")

    path = Path(argv[1]).expanduser()
    expected_duration = parse_float(argv[2]) if len(argv) > 2 else None
    if not path.exists():
        return fail("Exported short file does not exist.", path=str(path))
    if not path.is_file():
        return fail("Path is not a file.", path=str(path))

    ffprobe_bin = resolve_tool("ffprobe", "FFPROBE_PATH")
    ffmpeg_bin = resolve_tool("ffmpeg", "FFMPEG_PATH")
    if not ffprobe_bin or not ffmpeg_bin:
        return fail(
            "ffmpeg/ffprobe is not available. Install ffmpeg or set FFMPEG_PATH and FFPROBE_PATH.",
            path=str(path),
            details={
                "ffmpegResolved": ffmpeg_bin or "",
                "ffprobeResolved": ffprobe_bin or "",
                "checked": ["PATH", "/opt/homebrew/bin", "/usr/local/bin"],
            },
        )

    try:
        probe = ffprobe(path, ffprobe_bin)
    except Exception as exc:
        return fail(f"Could not probe media: {exc}", path=str(path))

    streams = probe.get("streams") or []
    audio_streams = [item for item in streams if item.get("codec_type") == "audio"]
    video_streams = [item for item in streams if item.get("codec_type") == "video"]
    duration = parse_float((probe.get("format") or {}).get("duration"))
    if duration is None:
        duration = max([parse_float(item.get("duration")) or 0 for item in streams] or [0])

    issues: list[str] = []
    warnings: list[str] = []
    if not audio_streams:
        issues.append("no-audio-stream")
    if not video_streams:
        warnings.append("no-video-stream")
    if not duration or duration <= 0:
        issues.append("unknown-or-zero-duration")
    if expected_duration and duration:
        drift = abs(duration - expected_duration)
        if drift > max(0.35, expected_duration * 0.05):
            warnings.append("duration-drift-from-recipe")
    else:
        drift = None

    astats = collect_astats(path, duration or 0, ffmpeg_bin) if audio_streams and duration else {}
    silence = collect_silence(path, duration or 0, ffmpeg_bin) if audio_streams and duration else {}

    rms = astats.get("rmsLevelDb")
    peak = astats.get("peakLevelDb")
    if isinstance(rms, (int, float)) and rms < -38:
        warnings.append("very-low-rms-level")
    if isinstance(peak, (int, float)) and peak > -0.2:
        warnings.append("possible-clipping-risk")
    longest_silence = parse_float(silence.get("longestSilenceSeconds")) or 0
    if duration and longest_silence > min(4.0, max(1.25, duration * 0.33)):
        warnings.append("long-silence-detected")

    status = "pass" if not issues and not warnings else ("fail" if issues else "needs_human_attention")
    payload = {
        "model": "quipsly-short-audio-sanity",
        "version": "2026-06-19.short-audio-sanity.v1",
        "status": status,
        "path": str(path),
        "fileSizeBytes": path.stat().st_size,
        "durationSeconds": duration,
        "expectedDurationSeconds": expected_duration,
        "durationDriftSeconds": drift,
        "audioStreamCount": len(audio_streams),
        "videoStreamCount": len(video_streams),
        "primaryAudio": audio_streams[0] if audio_streams else None,
        "issues": issues,
        "warnings": sorted(set(warnings)),
        "astats": astats,
        "silence": silence,
        "tools": {
            "ffmpeg": ffmpeg_bin,
            "ffprobe": ffprobe_bin,
        },
        "safeForListenThrough": not issues,
        "nextHumanAction": "Listen through for meaning, awkward cuts, sync, and editorial judgment." if not issues else "Fix export/audio before listen-through review.",
        "truth": "Audio sanity is objective preflight only. It does not mark listen-through complete, keep, reject, or publish.",
    }
    print(json.dumps(payload, indent=2))
    return 0 if not issues else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
