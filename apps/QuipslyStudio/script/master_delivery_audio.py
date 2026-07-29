#!/usr/bin/env python3
"""Master audio artifacts with measured, receipt-backed loudness."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, check=True, text=True, capture_output=True)


def has_video_stream(source: Path) -> bool:
    result = run(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=index", "-of", "csv=p=0", str(source),
        ]
    )
    return bool(result.stdout.strip())


def mastering_command(source: Path, output: Path, filter_value: str) -> tuple[list[str], str]:
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-n", "-i", str(source)]
    if has_video_stream(source):
        command.extend(
            [
                "-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy",
                "-af", filter_value, "-c:a", "aac", "-b:a", "256k", "-ar", "48000",
                "-movflags", "+faststart", str(output),
            ]
        )
        return command, "audiovisual"

    suffix = output.suffix.lower()
    command.extend(["-map", "0:a:0", "-af", filter_value])
    if suffix == ".wav":
        command.extend(["-c:a", "pcm_s24le", "-ar", "48000", str(output)])
    elif suffix in {".m4a", ".mp4"}:
        command.extend(["-c:a", "aac", "-b:a", "256k", "-ar", "48000", str(output)])
    elif suffix == ".flac":
        command.extend(["-c:a", "flac", "-ar", "48000", str(output)])
    else:
        raise ValueError(f"Unsupported audio-only master extension: {suffix}")
    return command, "audio"


def loudnorm_analysis(source: Path, target: float, true_peak: float, lra: float) -> dict[str, float]:
    result = run(
        [
            "ffmpeg", "-hide_banner", "-nostats", "-i", str(source),
            "-map", "0:a:0",
            "-af", f"loudnorm=I={target}:TP={true_peak}:LRA={lra}:print_format=json",
            "-f", "null", "-",
        ]
    )
    match = re.search(r"\{\s*\"input_i\".*?\}", result.stderr, re.DOTALL)
    if not match:
        raise RuntimeError("ffmpeg did not return loudnorm analysis JSON")
    raw = json.loads(match.group(0))
    return {key: float(value) for key, value in raw.items() if key != "normalization_type"}


def verify_output(source: Path) -> dict[str, float]:
    result = run(
        [
            "ffmpeg", "-hide_banner", "-nostats", "-i", str(source),
            "-map", "0:a:0", "-af", "ebur128=peak=true", "-f", "null", "-",
        ]
    )
    integrated = re.findall(r"I:\s+(-?[0-9.]+) LUFS", result.stderr)
    peak = re.findall(r"Peak:\s+(-?[0-9.]+) dBFS", result.stderr)
    if not integrated or not peak:
        raise RuntimeError("ffmpeg did not return final EBU R128 verification metrics")
    return {"integratedLufs": float(integrated[-1]), "truePeakDbfs": float(peak[-1])}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--target-lufs", type=float, default=-16.0)
    parser.add_argument("--true-peak", type=float, default=-1.5)
    parser.add_argument("--lra", type=float, default=11.0)
    parser.add_argument("--stage", default="authored-transition-audio-master")
    args = parser.parse_args()

    if not args.input.is_file():
        raise FileNotFoundError(args.input)
    if args.output.exists() or args.receipt.exists():
        raise FileExistsError("Refusing to overwrite a mastered transition or receipt")

    analysis = loudnorm_analysis(args.input, args.target_lufs, args.true_peak, args.lra)
    filter_value = (
        f"loudnorm=I={args.target_lufs}:TP={args.true_peak}:LRA={args.lra}:"
        f"measured_I={analysis['input_i']}:measured_TP={analysis['input_tp']}:"
        f"measured_LRA={analysis['input_lra']}:measured_thresh={analysis['input_thresh']}:"
        f"offset={analysis['target_offset']}:linear=true:print_format=summary"
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    command, media_kind = mastering_command(args.input, args.output, filter_value)
    run(command)
    verified = verify_output(args.output)
    if not (args.target_lufs - 1.0 <= verified["integratedLufs"] <= args.target_lufs + 1.0):
        raise RuntimeError(f"Master loudness outside tolerance: {verified}")
    if verified["truePeakDbfs"] > -1.0:
        raise RuntimeError(f"Master true peak is unsafe: {verified}")

    receipt = {
        "schemaVersion": 1,
        "stage": args.stage,
        "mediaKind": media_kind,
        "inputPremaster": str(args.input),
        "outputMaster": str(args.output),
        "target": {"integratedLufs": args.target_lufs, "truePeakDbfs": args.true_peak, "lra": args.lra},
        "analysis": analysis,
        "verification": verified,
        "sourceMediaMutated": False,
    }
    args.receipt.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
