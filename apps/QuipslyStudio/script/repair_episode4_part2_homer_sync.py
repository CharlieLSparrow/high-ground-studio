#!/usr/bin/env python3
"""Create a versioned Episode 4 Part 2 late-sync repair.

The legacy Episode 4 audio baseline placed Homer's fourth DJI recording at
5478.073s. Camera scratch-audio correlation shows that the recording belongs at
5481.543s, making its content 3.47s early in the refined stem. This tool inserts
the missing source-clock gap into a derived stem, updates a copied session to
use it, and moves one edit boundary past the end of Homer's clipped sentence.

Original media, the prior refined stem, and the prior session are never changed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_SESSION = Path.home() / (
    "Library/Application Support/Quipsly/MediaVault/sessions/"
    "episode-4-part-2-producer-v014-final-candidate.quipsly-session.json"
)
DEFAULT_SOURCE_STEM = Path(
    "/Volumes/My Passport/Quipsly Media Vault/audio/episode-4/"
    "v014-homer-parity-trim/homer-dji-treated-parity.wav"
)
DEFAULT_OUTPUT_DIR = Path(
    "/Volumes/My Passport/Quipsly Media Vault/audio/episode-4/"
    "v017-homer-late-sync-corrected"
)
DEFAULT_SESSION_OUTPUT = Path.home() / (
    "Library/Application Support/Quipsly/MediaVault/sessions/"
    "episode-4-part-2-producer-v015-sync-boundary-repair.quipsly-session.json"
)
CORRECTION_START_SECONDS = 5478.073
CORRECTION_SECONDS = 3.47
EXPECTED_DURATION_SECONDS = 6799.943
CLIPPED_KEEP_END_SECONDS = 6236.0
REPAIRED_KEEP_END_SECONDS = 6236.74


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def probe(path: Path) -> dict[str, Any]:
    output = subprocess.check_output(
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
        text=True,
    )
    return json.loads(output)


def replace_string(value: Any, old: str, new: str) -> Any:
    if isinstance(value, dict):
        return {key: replace_string(item, old, new) for key, item in value.items()}
    if isinstance(value, list):
        return [replace_string(item, old, new) for item in value]
    if isinstance(value, str):
        return value.replace(old, new)
    return value


def active_sequence(session: dict[str, Any]) -> dict[str, Any]:
    active_id = session["activeSequenceId"]
    return next(
        sequence
        for sequence in session["project"]["sequences"]
        if sequence["id"] == active_id
    )


def render_corrected_stem(source: Path, output: Path) -> list[str]:
    shifted_source_end = EXPECTED_DURATION_SECONDS - CORRECTION_SECONDS
    filter_graph = (
        f"[0:a]atrim=0:{CORRECTION_START_SECONDS},asetpts=PTS-STARTPTS[before];"
        f"anullsrc=r=48000:cl=stereo,atrim=duration={CORRECTION_SECONDS}[gap];"
        f"[0:a]atrim={CORRECTION_START_SECONDS}:{shifted_source_end},"
        "asetpts=PTS-STARTPTS[after];"
        "[before][gap][after]concat=n=3:v=0:a=1,"
        f"atrim=0:{EXPECTED_DURATION_SECONDS},asetpts=N/SR/TB[out]"
    )
    command = [
        "ffmpeg",
        "-hide_banner",
        "-nostdin",
        "-y",
        "-i",
        str(source),
        "-filter_complex",
        filter_graph,
        "-map",
        "[out]",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-c:a",
        "pcm_s24le",
        str(output),
    ]
    subprocess.run(command, check=True)
    return command


def repair_session(
    source_session: Path,
    output_session: Path,
    source_stem: Path,
    corrected_stem: Path,
    manifest_path: Path,
) -> None:
    session = json.loads(source_session.read_text())
    repaired = replace_string(deepcopy(session), str(source_stem), str(corrected_stem))
    sequence = active_sequence(repaired)
    sequence["id"] = str(uuid.uuid4()).upper()
    repaired["activeSequenceId"] = sequence["id"]
    sequence["title"] = (
        "Episode 4 Part 2 - Incentives, Intent, and Time - "
        "Producer v015 Sync Boundary Repair"
    )
    metadata = sequence.setdefault("branchMetadata", {})
    metadata.update(
        {
            "branchId": str(uuid.uuid4()).upper(),
            "branchName": "Episode 4 Part 2 - Producer v015 Sync Boundary Repair",
            "branchStatus": "repair-candidate",
            "createdAt": now_iso(),
            "updatedAt": now_iso(),
            "createdBy": "Codex Producer",
            "syncRepairManifest": str(manifest_path),
            "finalizationSourceSession": str(source_session),
        }
    )
    repaired_boundary = False
    for item in metadata.get("programKeepRanges", []):
        if abs(float(item.get("endTime", -1)) - CLIPPED_KEEP_END_SECONDS) < 0.001:
            item["endTime"] = REPAIRED_KEEP_END_SECONDS
            item["reason"] = (
                "Keep the complete farm-bike story and Homer response through "
                "the utterance-safe tail; no word is cut at the outgoing seam."
            )
            repaired_boundary = True
    if not repaired_boundary:
        raise RuntimeError("Expected clipped Part 2 keep boundary was not found.")
    repaired["savedAt"] = now_iso()
    if output_session.exists():
        raise FileExistsError(f"Refusing to overwrite session: {output_session}")
    output_session.parent.mkdir(parents=True, exist_ok=True)
    output_session.write_text(json.dumps(repaired, indent=2, sort_keys=True) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--session", type=Path, default=DEFAULT_SESSION)
    parser.add_argument("--source-stem", type=Path, default=DEFAULT_SOURCE_STEM)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--session-output", type=Path, default=DEFAULT_SESSION_OUTPUT)
    args = parser.parse_args()

    for required in (args.session, args.source_stem):
        if not required.is_file():
            raise FileNotFoundError(required)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    output_stem = args.output_dir / "homer-dji-treated-parity-late-sync-corrected.wav"
    manifest_path = args.output_dir / "manifest.json"
    for output in (output_stem, manifest_path, args.session_output):
        if output.exists():
            raise FileExistsError(f"Refusing to overwrite output: {output}")

    command = render_corrected_stem(args.source_stem, output_stem)
    measured_duration = float(probe(output_stem)["format"]["duration"])
    if abs(measured_duration - EXPECTED_DURATION_SECONDS) > 0.01:
        raise RuntimeError(
            f"Corrected stem duration {measured_duration:.6f}s does not match "
            f"{EXPECTED_DURATION_SECONDS:.6f}s."
        )
    manifest = {
        "schema": "quipsly.audio-sync-boundary-repair.v1",
        "generatedAt": now_iso(),
        "episode": "episode-4",
        "speaker": "homer",
        "source": {
            "path": str(args.source_stem),
            "sha256": sha256(args.source_stem),
            "mutated": False,
        },
        "output": {
            "path": str(output_stem),
            "sha256": sha256(output_stem),
            "probe": probe(output_stem),
        },
        "repair": {
            "sourceBoundarySeconds": CORRECTION_START_SECONDS,
            "delayInsertedSeconds": CORRECTION_SECONDS,
            "correctedSourceStartSeconds": (
                CORRECTION_START_SECONDS + CORRECTION_SECONDS
            ),
            "evidence": (
                "Homer camera scratch audio agrees before the MIC008 boundary "
                "and measures the refined stem 3.47s early after it."
            ),
        },
        "command": command,
        "originalMediaMutated": False,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    repair_session(
        args.session,
        args.session_output,
        args.source_stem,
        output_stem,
        manifest_path,
    )
    print(
        json.dumps(
            {
                "status": "created",
                "correctedStem": str(output_stem),
                "session": str(args.session_output),
                "manifest": str(manifest_path),
            }
        )
    )


if __name__ == "__main__":
    main()
