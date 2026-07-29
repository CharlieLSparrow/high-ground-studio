#!/usr/bin/env python3
"""Create a platform-clean derivative for the selected short proof.

The clean copy strips non-audio/video streams from the rendered proof while
preserving the original proof and all source media. This is for platform
handoff hygiene, not editorial approval.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from selected_short_proof_review import (  # noqa: E402
    DEFAULT_BASE_URL,
    dict_value,
    ffprobe,
    n,
    render_markdown as render_proof_markdown,
    s,
    slugify,
    build_review,
)


DEFAULT_OUTPUT_ROOT = Path.home() / "Movies" / "QuipslyExports" / "ShortPlatformCleanCopies"


def clean_copy_command(source: Path, destination: Path) -> list[str]:
    return [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-n",
        "-i",
        str(source),
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-c",
        "copy",
        "-dn",
        "-sn",
        "-map_metadata",
        "-1",
        "-map_chapters",
        "-1",
        "-movflags",
        "+faststart",
        str(destination),
    ]


def run_clean_copy(source: Path, destination: Path) -> tuple[bool, str]:
    try:
        completed = subprocess.run(clean_copy_command(source, destination), check=True, capture_output=True, text=True)
        return True, (completed.stderr or completed.stdout or "").strip()
    except FileNotFoundError as exc:
        return False, f"missing tool: {exc.filename}"
    except subprocess.CalledProcessError as exc:
        return False, (exc.stderr or exc.stdout or str(exc)).strip()


def proof_summary(probe: dict[str, Any] | None) -> dict[str, Any]:
    if probe is None:
        return {
            "videoStreamCount": 0,
            "audioStreamCount": 0,
            "dataStreamCount": 0,
            "width": 0,
            "height": 0,
            "duration": 0,
            "size": 0,
        }
    streams = [stream for stream in probe.get("streams", []) if isinstance(stream, dict)]
    video = [stream for stream in streams if stream.get("codec_type") == "video"]
    audio = [stream for stream in streams if stream.get("codec_type") == "audio"]
    data = [stream for stream in streams if stream.get("codec_type") == "data"]
    fmt = dict_value(probe.get("format"))
    first_video = video[0] if video else {}
    return {
        "videoStreamCount": len(video),
        "audioStreamCount": len(audio),
        "dataStreamCount": len(data),
        "width": int(n(first_video.get("width"))),
        "height": int(n(first_video.get("height"))),
        "duration": n(fmt.get("duration")),
        "size": int(n(fmt.get("size"))),
    }


def build_clean_copy(base_url: str, output_root: Path) -> dict[str, Any]:
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    proof_review = build_review(base_url, save=False, output_root=output_root)
    selected = dict_value(proof_review.get("selectedShort"))
    proof = dict_value(proof_review.get("proof"))
    title = s(selected.get("title")) or "selected-short"
    source_path = Path(s(proof.get("path"))).expanduser()

    if proof_review.get("status") == "state-unreachable":
        return {
            "status": "state-unreachable",
            "model": "quipslystudio-selected-short-platform-clean-copy",
            "generatedAt": generated_at,
            "proofReview": proof_review,
            "truth": "Could not read selected-short proof state. No files were created or changed.",
        }

    if not s(proof.get("path")) or not source_path.exists():
        return {
            "status": "missing-proof",
            "model": "quipslystudio-selected-short-platform-clean-copy",
            "generatedAt": generated_at,
            "selectedShort": selected,
            "sourceProofPath": s(proof.get("path")),
            "nextActions": ["Export or repair the selected short proof before creating a platform-clean copy."],
            "truth": "No clean copy was created. Source media and previous exports remain untouched.",
        }

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    folder = output_root.expanduser().resolve() / f"{stamp}-{slugify(title)}"
    folder.mkdir(parents=True, exist_ok=False)
    destination = folder / f"{slugify(title)}-platform-clean.mp4"

    ok, message = run_clean_copy(source_path, destination)
    if not ok:
        return {
            "status": "clean-copy-failed",
            "model": "quipslystudio-selected-short-platform-clean-copy",
            "generatedAt": generated_at,
            "selectedShort": selected,
            "sourceProofPath": str(source_path),
            "outputPath": str(destination),
            "error": message,
            "truth": "Clean copy failed. Source media and previous exports remain untouched.",
        }

    source_probe, source_probe_error = ffprobe(source_path)
    clean_probe, clean_probe_error = ffprobe(destination)
    source_summary = proof_summary(source_probe)
    clean_summary = proof_summary(clean_probe)
    warnings: list[str] = []
    strengths: list[str] = []
    next_actions: list[str] = []

    if clean_probe is None:
        warnings.append(f"Clean copy was created but could not be probed: {clean_probe_error}")
    if clean_summary["dataStreamCount"] == 0:
        strengths.append("Clean copy has no data streams.")
    else:
        warnings.append("Clean copy still has data streams; platform hygiene is not resolved.")
    if clean_summary["videoStreamCount"] >= 1 and clean_summary["audioStreamCount"] >= 1:
        strengths.append("Clean copy keeps video and audio streams.")
    if abs(clean_summary["duration"] - source_summary["duration"]) <= 0.25:
        strengths.append("Clean copy duration matches the source proof.")
    else:
        warnings.append("Clean copy duration differs from the source proof; review before handoff.")
    if clean_summary["width"] == source_summary["width"] and clean_summary["height"] == source_summary["height"]:
        strengths.append("Clean copy preserves frame size.")
    else:
        warnings.append("Clean copy frame size differs from source proof.")

    if s(selected.get("reviewStatus")) != "keep":
        next_actions.append(f"Editorial status is `{s(selected.get('reviewStatus')) or 'unknown'}`; do not treat clean copy as publication approval.")
    next_actions.append("Watch/listen to the clean copy before platform handoff.")
    next_actions.append("If clean copy is accepted, record platform readiness separately from publication receipts.")

    payload = {
        "status": "clean-copy-created" if not warnings else "clean-copy-needs-review",
        "model": "quipslystudio-selected-short-platform-clean-copy",
        "generatedAt": generated_at,
        "selectedShort": selected,
        "sourceProofPath": str(source_path),
        "outputPath": str(destination),
        "outputFolder": str(folder),
        "sourceProbe": {
            "summary": source_summary,
            "error": source_probe_error,
        },
        "cleanProbe": {
            "summary": clean_summary,
            "error": clean_probe_error,
        },
        "proofReview": proof_review,
        "strengths": strengths,
        "warnings": warnings,
        "nextActions": next_actions,
        "truth": "Created a new platform-clean derivative from the selected short proof. Original media and previous exports were not mutated or overwritten.",
    }
    (folder / "selected-short-platform-clean-copy.json").write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    (folder / "selected-short-platform-clean-copy.md").write_text(render_markdown(payload), encoding="utf-8")
    return payload


def render_markdown(payload: dict[str, Any]) -> str:
    selected = dict_value(payload.get("selectedShort"))
    source = dict_value(dict_value(payload.get("sourceProbe")).get("summary"))
    clean = dict_value(dict_value(payload.get("cleanProbe")).get("summary"))
    lines = [
        "# Selected Short Platform Clean Copy",
        "",
        s(payload.get("truth")) or "Clean derivative only.",
        "",
        f"- Status: `{s(payload.get('status'))}`",
        f"- Short: {s(selected.get('title'))}",
        f"- Review status: `{s(selected.get('reviewStatus')) or 'unknown'}`",
        f"- Source proof: `{s(payload.get('sourceProofPath'))}`",
        f"- Clean copy: `{s(payload.get('outputPath'))}`",
        "",
        "## Stream summary",
        f"- Source: video {int(n(source.get('videoStreamCount')))}, audio {int(n(source.get('audioStreamCount')))}, data {int(n(source.get('dataStreamCount')))}, {int(n(source.get('width')))}x{int(n(source.get('height')))}, {n(source.get('duration')):.2f}s",
        f"- Clean: video {int(n(clean.get('videoStreamCount')))}, audio {int(n(clean.get('audioStreamCount')))}, data {int(n(clean.get('dataStreamCount')))}, {int(n(clean.get('width')))}x{int(n(clean.get('height')))}, {n(clean.get('duration')):.2f}s",
        "",
        "## Strengths",
    ]
    strengths = payload.get("strengths") or []
    lines.extend(f"- {s(item)}" for item in strengths) if strengths else lines.append("- none yet")
    lines.extend(["", "## Warnings"])
    warnings = payload.get("warnings") or []
    lines.extend(f"- {s(item)}" for item in warnings) if warnings else lines.append("- none")
    lines.extend(["", "## Next actions"])
    for item in payload.get("nextActions") or []:
        lines.append(f"- {s(item)}")

    proof_review = dict_value(payload.get("proofReview"))
    if proof_review:
        lines.extend(["", "## Underlying proof review", ""])
        lines.append(render_proof_markdown(proof_review).strip())

    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a platform-clean copy for the selected short proof.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT))
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    args = parser.parse_args()

    payload = build_clean_copy(args.base_url, Path(args.output_root))
    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(payload), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
