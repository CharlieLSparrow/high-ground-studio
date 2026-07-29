#!/usr/bin/env python3
"""Render separate Episode 4 treatment stems from a promoted audio profile.

This deliberately stops before mix/master. Charlie, Homer, and reference stay
separate, equal-length, and source-aware so editorial timing remains available.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_PROFILE = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/"
    "Episode_4_Sync_Producer_Takes/"
    "20260709-episode4-conformed-audio-baseline-v005-20260709-183059/"
    "work/conformed-production-baseline/"
    "profile-promotion-v005-to-v008-homer-rich-balanced-20260712-225859/"
    "audio-workbench-profile-promotion-v008.json"
)
DEFAULT_OUTPUT = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/"
    "Episode_4_Sync_Producer_Takes/"
    "20260709-episode4-conformed-audio-baseline-v005-20260709-183059/"
    "work/treatment-stems-v010-homer-rich-balanced-20260714"
)
EXPECTED_DURATION = 6799.943
OUTPUTS = (
    ("charlie", "charlie-contribution-gated.wav"),
    ("homer", "homer-dji-contribution-gated.wav"),
    ("reference", "reference-contribution-controlled.wav"),
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def probe(path: Path) -> dict[str, Any]:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "stream=codec_name,sample_rate,channels:format=duration,size",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def source_mix_command(profile: dict[str, Any]) -> list[str]:
    command = profile.get("commands", {}).get("sourceAwareMix")
    if not isinstance(command, list):
        raise RuntimeError("Profile does not contain commands.sourceAwareMix")
    return [str(value) for value in command]


def profile_parts(command: list[str]) -> tuple[list[Path], list[str]]:
    inputs: list[Path] = []
    for index, value in enumerate(command[:-1]):
        if value == "-i":
            inputs.append(Path(command[index + 1]))
    try:
        filter_text = command[command.index("-filter_complex") + 1]
    except (ValueError, IndexError) as error:
        raise RuntimeError("Profile source-aware mix has no filter graph") from error
    match = re.fullmatch(
        r"\[0:a\](.*?)\[c\];\[1:a\](.*?)\[h\];\[2:a\](.*?)\[r\];.*",
        filter_text,
    )
    if len(inputs) != 3 or not match:
        raise RuntimeError("Profile filter graph is not the expected three-source shape")
    return inputs, [match.group(1), match.group(2), match.group(3)]


def render(input_path: Path, filter_chain: str, output_path: Path) -> list[str]:
    partial = output_path.with_name(f".{output_path.name}.partial.wav")
    partial.unlink(missing_ok=True)
    full_filter = (
        f"{filter_chain},apad=whole_dur={EXPECTED_DURATION:.3f},"
        f"atrim=0:{EXPECTED_DURATION:.3f},asetpts=N/SR/TB"
    )
    command = [
        "ffmpeg",
        "-hide_banner",
        "-nostdin",
        "-y",
        "-i",
        str(input_path),
        "-af",
        full_filter,
        "-ar",
        "48000",
        "-ac",
        "2",
        "-c:a",
        "pcm_s24le",
        str(partial),
    ]
    subprocess.run(command, check=True)
    metadata = probe(partial)
    duration = float(metadata["format"]["duration"])
    if abs(duration - EXPECTED_DURATION) > 0.02:
        partial.unlink(missing_ok=True)
        raise RuntimeError(f"Rendered stem has wrong duration: {duration}")
    os.replace(partial, output_path)
    return command


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", type=Path, default=DEFAULT_PROFILE)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    profile_path = args.profile.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve(strict=False)
    if output_dir.exists() and any(output_dir.iterdir()):
        raise RuntimeError(f"Refusing to overwrite treatment version: {output_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)

    profile = json.loads(profile_path.read_text(encoding="utf-8"))
    inputs, filters = profile_parts(source_mix_command(profile))
    artifacts: list[dict[str, Any]] = []
    for (speaker, filename), input_path, filter_chain in zip(OUTPUTS, inputs, filters):
        output_path = output_dir / filename
        print(f"TREAT {speaker}: {input_path.name} -> {output_path.name}", flush=True)
        command = render(input_path, filter_chain, output_path)
        artifacts.append(
            {
                "speaker": speaker,
                "inputPath": str(input_path),
                "outputPath": str(output_path),
                "filter": filter_chain,
                "command": command,
                "probe": probe(output_path),
                "sha256": sha256(output_path),
            }
        )

    manifest = {
        "schema": "quipsly.source-aware-treatment-stems.v1",
        "generatedAt": utc_now(),
        "version": "v010",
        "profile": profile.get("selectedProfile", "homer-rich-balanced-v007"),
        "profileIntent": profile.get("selectedProfileIntent", ""),
        "profileEvidence": str(profile_path),
        "expectedDurationSeconds": EXPECTED_DURATION,
        "originalMediaMutated": False,
        "combinedMixCanonical": False,
        "editorialTruth": "separate equal-length Charlie, Homer, and reference stems",
        "artifacts": artifacts,
    }
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"MANIFEST={manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
