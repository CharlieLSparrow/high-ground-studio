#!/usr/bin/env python3
"""Create source-preserving podcast and video delivery audio after picture lock."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def run(command: list[str], *, capture: bool = False) -> subprocess.CompletedProcess[str]:
    print("$", " ".join(command))
    return subprocess.run(command, check=True, text=True, capture_output=capture)


def probe(path: Path) -> dict[str, Any]:
    result = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_format",
            "-show_streams",
            "-print_format",
            "json",
            str(path),
        ],
        capture=True,
    )
    return json.loads(result.stdout)


def branch_filter(ranges: list[dict[str, Any]]) -> str:
    labels: list[str] = []
    filters: list[str] = []
    for index, item in enumerate(ranges):
        start = float(item["start"])
        end = float(item["end"])
        duration = end - start
        fade_out = max(0.0, duration - 0.005)
        label = f"branch_{index}"
        labels.append(f"[{label}]")
        filters.append(
            f"[0:a]atrim=start={start:.6f}:end={end:.6f},"
            f"asetpts=PTS-STARTPTS,"
            f"afade=t=in:st=0:d=0.005,"
            f"afade=t=out:st={fade_out:.6f}:d=0.005[{label}]"
        )
    filters.append("".join(labels) + f"concat=n={len(labels)}:v=0:a=1[program_audio]")
    return ";".join(filters)


def loudnorm_measure(path: Path, target_lufs: float) -> dict[str, str]:
    result = run(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-i",
            str(path),
            "-af",
            f"loudnorm=I={target_lufs}:LRA=11:TP=-1.5:print_format=json",
            "-f",
            "null",
            "-",
        ],
        capture=True,
    )
    matches = re.findall(r"\{\s*\"input_i\".*?\}", result.stderr, re.DOTALL)
    if not matches:
        raise RuntimeError("FFmpeg loudnorm did not return a measurement payload")
    payload = json.loads(matches[-1])
    required = {"input_i", "input_tp", "input_lra", "input_thresh", "target_offset"}
    if missing := required.difference(payload):
        raise RuntimeError(f"FFmpeg loudnorm payload is missing: {sorted(missing)}")
    return payload


def normalize(source: Path, target: Path, *, target_lufs: float) -> dict[str, str]:
    measured = loudnorm_measure(source, target_lufs)
    audio_filter = (
        f"loudnorm=I={target_lufs}:LRA=11:TP=-1.5:"
        f"measured_I={measured['input_i']}:"
        f"measured_TP={measured['input_tp']}:"
        f"measured_LRA={measured['input_lra']}:"
        f"measured_thresh={measured['input_thresh']}:"
        f"offset={measured['target_offset']}:"
        "linear=true:print_format=summary"
    )
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-i",
            str(source),
            "-af",
            audio_filter,
            "-ar",
            "48000",
            "-ac",
            "2",
            "-c:a",
            "pcm_s24le",
            str(target),
        ]
    )
    return measured


def final_loudness(path: Path) -> dict[str, float | None]:
    result = run(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-i",
            str(path),
            "-filter_complex",
            "ebur128=peak=true",
            "-f",
            "null",
            "-",
        ],
        capture=True,
    )
    integrated = re.findall(r"I:\s+(-?[0-9.]+) LUFS", result.stderr)
    peaks = re.findall(r"Peak:\s+(-?[0-9.]+) dBFS", result.stderr)
    return {
        "integratedLufs": float(integrated[-1]) if integrated else None,
        "truePeakDbfs": float(peaks[-1]) if peaks else None,
    }


def encode_aac(source: Path, target: Path) -> None:
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-i",
            str(source),
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            str(target),
        ]
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--label", required=True)
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text())
    args.output_dir.mkdir(parents=True, exist_ok=False)

    source_mix = Path(manifest["truth"]["branchAudioMixPath"])
    picture = Path(manifest["outputs"]["pictureAssembly"]["path"])
    ranges = manifest["ranges"]
    if not source_mix.exists() or not picture.exists():
        raise FileNotFoundError(
            f"Missing source-aware mix or picture assembly: {source_mix}, {picture}"
        )

    edit_wav = args.output_dir / f"{args.label}-edit-audio-lossless-v001.wav"
    podcast_wav = args.output_dir / f"{args.label}-podcast-master-v001.wav"
    podcast_m4a = args.output_dir / f"{args.label}-podcast-master-v001.m4a"
    video_wav = args.output_dir / f"{args.label}-video-master-v001.wav"
    video_m4a = args.output_dir / f"{args.label}-video-master-v001.m4a"
    video_mp4 = args.output_dir / f"{args.label}-16x9-v001.mp4"

    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-i",
            str(source_mix),
            "-filter_complex",
            branch_filter(ranges),
            "-map",
            "[program_audio]",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-c:a",
            "pcm_s24le",
            str(edit_wav),
        ]
    )

    podcast_measurement = normalize(edit_wav, podcast_wav, target_lufs=-16.0)
    video_measurement = normalize(edit_wav, video_wav, target_lufs=-14.0)
    encode_aac(podcast_wav, podcast_m4a)
    encode_aac(video_wav, video_m4a)
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-i",
            str(picture),
            "-i",
            str(video_m4a),
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            "copy",
            "-c:a",
            "copy",
            "-movflags",
            "+faststart",
            "-shortest",
            str(video_mp4),
        ]
    )

    delivery_manifest = {
        "schema": "quipsly.episode-delivery-audio.v1",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "sourceManifest": str(args.manifest),
        "sourceAwareMix": str(source_mix),
        "sourcePicture": str(picture),
        "originalMediaMutated": False,
        "ranges": ranges,
        "editAudio": {"path": str(edit_wav), "probe": probe(edit_wav)},
        "podcast": {
            "targetLufs": -16.0,
            "targetTruePeakDbfs": -1.5,
            "measurementPass": podcast_measurement,
            "finalMeasurement": final_loudness(podcast_wav),
            "wav": str(podcast_wav),
            "m4a": str(podcast_m4a),
            "probe": probe(podcast_m4a),
        },
        "video": {
            "targetLufs": -14.0,
            "targetTruePeakDbfs": -1.5,
            "measurementPass": video_measurement,
            "finalMeasurement": final_loudness(video_wav),
            "wav": str(video_wav),
            "m4a": str(video_m4a),
            "mp4": str(video_mp4),
            "probe": probe(video_mp4),
        },
    }
    manifest_path = args.output_dir / "delivery-manifest.json"
    manifest_path.write_text(json.dumps(delivery_manifest, indent=2) + "\n")
    print(json.dumps({"status": "ready", "manifest": str(manifest_path)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
