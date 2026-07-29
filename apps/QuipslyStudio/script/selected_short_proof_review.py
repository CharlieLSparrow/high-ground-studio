#!/usr/bin/env python3
"""Review the selected short's rendered proof file.

This is a proof layer, not an editorial approval layer. It checks whether the
selected short has an actual file, what streams it contains, whether duration
and aspect look sane, and optionally saves a contact sheet for human/agent
visual review.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_BASE_URL = (
    os.environ.get("QUIPSLY_STUDIO_AGENT_URL")
    or os.environ.get("QUIPSLY_AGENT_URL")
    or "http://127.0.0.1:8080"
)
DEFAULT_OUTPUT_ROOT = Path.home() / "Movies" / "QuipslyExports" / "ShortProofReviews"


def s(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def n(value: Any) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return 0.0
    return 0.0


def slugify(value: str, fallback: str = "selected-short") -> str:
    slug = "".join(ch.lower() if ch.isalnum() else "-" for ch in value).strip("-")
    slug = "-".join(part for part in slug.split("-") if part)
    return slug[:90] or fallback


def fetch_state(base_url: str) -> dict[str, Any]:
    url = f"{base_url.rstrip('/')}/state"
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=6) as response:
        return json.loads(response.read().decode("utf-8"))


def dict_value(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def selected_short_from_state(state: dict[str, Any]) -> dict[str, Any]:
    return dict_value(state.get("selectedShortClip"))


def explicit_path_candidates(selected: dict[str, Any]) -> list[str]:
    candidates: list[str] = []
    containers = [
        selected,
        dict_value(selected.get("publicationPassport")),
        dict_value(selected.get("exportProof")),
        dict_value(selected.get("proof")),
        dict_value(selected.get("creatorQuality")),
    ]
    keys = [
        "lastExportedPath",
        "expectedExportPath",
        "exportedPath",
        "proofPath",
        "filePath",
        "path",
    ]
    for container in containers:
        for key in keys:
            text = s(container.get(key))
            if text and text not in candidates:
                candidates.append(text)
    return candidates


def pick_proof_path(selected: dict[str, Any]) -> tuple[str, list[str]]:
    candidates = explicit_path_candidates(selected)
    for candidate in candidates:
        if candidate.startswith("/") and Path(candidate).expanduser().exists():
            return candidate, candidates
    for candidate in candidates:
        if candidate.startswith("/"):
            return candidate, candidates
    return "", candidates


def run_json(command: list[str]) -> tuple[dict[str, Any] | None, str]:
    try:
        completed = subprocess.run(command, check=True, capture_output=True, text=True)
        return json.loads(completed.stdout or "{}"), ""
    except FileNotFoundError as exc:
        return None, f"missing tool: {exc.filename}"
    except subprocess.CalledProcessError as exc:
        return None, (exc.stderr or exc.stdout or str(exc)).strip()
    except json.JSONDecodeError as exc:
        return None, f"invalid json: {exc}"


def ffprobe(path: Path) -> tuple[dict[str, Any] | None, str]:
    return run_json(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "stream=index,codec_name,codec_type,width,height,r_frame_rate,sample_rate,channels,duration:format=duration,size,format_name",
            "-of",
            "json",
            str(path),
        ]
    )


def make_contact_sheet(path: Path, output_folder: Path, duration: float) -> tuple[str, str]:
    output_folder.mkdir(parents=True, exist_ok=True)
    output = output_folder / "contact-sheet.jpg"
    seconds_per_frame = max(1.0, duration / 6.0) if duration > 0 else 7.5
    command = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-n",
        "-i",
        str(path),
        "-vf",
        f"fps=1/{seconds_per_frame:.3f},scale=270:480,tile=3x2",
        "-frames:v",
        "1",
        str(output),
    ]
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
        return str(output), ""
    except FileNotFoundError as exc:
        return "", f"missing tool: {exc.filename}"
    except subprocess.CalledProcessError as exc:
        if output.exists():
            return str(output), ""
        return "", (exc.stderr or exc.stdout or str(exc)).strip()


def stream_duration(stream: dict[str, Any]) -> float:
    return n(stream.get("duration"))


def build_review(base_url: str, save: bool, output_root: Path) -> dict[str, Any]:
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    try:
        state = fetch_state(base_url)
    except Exception as exc:
        return {
            "status": "state-unreachable",
            "model": "quipslystudio-selected-short-proof-review",
            "baseUrl": base_url,
            "generatedAt": generated_at,
            "error": str(exc),
            "truth": "Could not read app state. No media, exports, selections, or source files were changed.",
        }

    selected = selected_short_from_state(state)
    proof_path_text, candidates = pick_proof_path(selected)
    title = s(selected.get("title")) or "No selected short"
    proof_path = Path(proof_path_text).expanduser() if proof_path_text else None
    proof_exists = bool(proof_path and proof_path.exists())
    warnings: list[str] = []
    strengths: list[str] = []
    next_actions: list[str] = []

    if not selected.get("id"):
        warnings.append("No selected short recipe is present in app state.")
        next_actions.append("Select a short recipe in Quipsly Studio, then rerun proof review.")
    if not proof_path_text:
        warnings.append("No proof/export path is attached to the selected short.")
        next_actions.append("Export or attach a proof file before treating this short as reviewable.")
    elif not proof_exists:
        warnings.append(f"Proof path is attached but missing on disk: {proof_path_text}")
        next_actions.append("Re-export the short or repair the proof path before review.")

    probe: dict[str, Any] | None = None
    probe_error = ""
    contact_sheet = ""
    contact_sheet_error = ""
    video_streams: list[dict[str, Any]] = []
    audio_streams: list[dict[str, Any]] = []
    data_streams: list[dict[str, Any]] = []
    width = 0
    height = 0
    format_duration = 0.0
    file_size = 0
    duration_spread = 0.0
    aspect = "unknown"

    if proof_exists and proof_path:
        probe, probe_error = ffprobe(proof_path)
        if probe is None:
            warnings.append(f"Could not probe proof file: {probe_error}")
            next_actions.append("Fix ffprobe/proof readability before platform handoff.")
        else:
            streams = [item for item in probe.get("streams", []) if isinstance(item, dict)]
            video_streams = [item for item in streams if item.get("codec_type") == "video"]
            audio_streams = [item for item in streams if item.get("codec_type") == "audio"]
            data_streams = [item for item in streams if item.get("codec_type") == "data"]
            fmt = dict_value(probe.get("format"))
            format_duration = n(fmt.get("duration"))
            file_size = int(n(fmt.get("size")))
            if video_streams:
                width = int(n(video_streams[0].get("width")))
                height = int(n(video_streams[0].get("height")))
                aspect = "vertical-9x16" if width and height and height > width else "not-vertical"
            else:
                warnings.append("Proof has no video stream.")
            if not audio_streams:
                warnings.append("Proof has no audio stream.")
            durations = [
                stream_duration(stream)
                for stream in video_streams + audio_streams
                if stream_duration(stream) > 0
            ]
            if durations:
                duration_spread = max(durations) - min(durations)
                if duration_spread > 0.25:
                    warnings.append(f"Audio/video duration spread is {duration_spread:.2f}s.")
            if data_streams:
                warnings.append("Proof includes non-audio/video data stream(s); strip them before platform handoff if possible.")
                next_actions.append("Create a platform-clean derivative before platform handoff: script/agentctl.sh selected-short-platform-clean-copy")
            if aspect == "vertical-9x16":
                strengths.append(f"Proof is vertical: {width}x{height}.")
            elif width and height:
                warnings.append(f"Proof is not vertical 9:16: {width}x{height}.")
            if video_streams and audio_streams and duration_spread <= 0.25:
                strengths.append("Video and audio streams are present and duration-aligned.")
            if format_duration:
                strengths.append(f"Proof duration is {format_duration:.1f}s.")
            if save:
                stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
                folder = output_root.expanduser().resolve() / f"{stamp}-{slugify(title)}"
                contact_sheet, contact_sheet_error = make_contact_sheet(proof_path, folder, format_duration)
                if contact_sheet:
                    strengths.append("Contact sheet generated for visual crop/caption review.")
                elif contact_sheet_error:
                    warnings.append(f"Contact sheet was not generated: {contact_sheet_error}")

    review_status = s(selected.get("reviewStatus")) or "unknown"
    hook = s(selected.get("hookText"))
    caption = s(selected.get("captionDraft")) or s(selected.get("primaryOverlayText"))
    if review_status != "keep":
        next_actions.append(f"Editorial review status is `{review_status}`; choose Keep only after watching/listening.")
    next_actions.append("Run audio rhythm proof before Keep/Refine: script/agentctl.sh selected-short-audio-rhythm-proof --save")
    if not hook:
        warnings.append("Selected short has no hook text.")
        next_actions.append("Draft a first-three-seconds hook before platform packaging.")
    if caption:
        next_actions.append("Verify captions/text are visible and face-safe in the actual rendered proof.")
    else:
        warnings.append("Selected short has no caption or overlay metadata.")
        next_actions.append("Draft caption or overlay metadata before publication prep.")
    if dict_value(state.get("cutIntelligence")).get("craftProfile", {}).get("transcriptCoverageStatus") == "missing":
        warnings.append("Transcript coverage is missing, limiting sentence-boundary and cadence intelligence.")
        next_actions.append("Generate or attach transcript timing before trusting deeper J/L cut advice.")

    if not next_actions and not warnings:
        next_actions.append("Watch the proof like a stranger, then mark Keep/Refine/Reject with a note.")

    status = "missing-proof"
    if proof_exists and probe is not None:
        status = "needs-review" if warnings else "proof-sane"

    review = {
        "status": status,
        "model": "quipslystudio-selected-short-proof-review",
        "generatedAt": generated_at,
        "baseUrl": base_url,
        "selectedShort": {
            "id": selected.get("id") or "",
            "title": title,
            "reviewStatus": review_status,
            "sequenceStart": selected.get("sequenceStartTime") or selected.get("startTime") or 0,
            "sequenceEnd": selected.get("sequenceEndTime") or selected.get("endTime") or 0,
            "duration": selected.get("recipeDuration") or selected.get("duration") or 0,
            "hook": hook,
            "captionDraft": caption,
        },
        "proof": {
            "path": proof_path_text,
            "candidatePaths": candidates,
            "exists": proof_exists,
            "width": width,
            "height": height,
            "aspect": aspect,
            "duration": format_duration,
            "fileSizeBytes": file_size,
            "videoStreamCount": len(video_streams),
            "audioStreamCount": len(audio_streams),
            "dataStreamCount": len(data_streams),
            "durationSpreadSeconds": duration_spread,
            "contactSheetPath": contact_sheet,
            "probeError": probe_error,
        },
        "strengths": strengths,
        "warnings": warnings,
        "nextActions": next_actions,
        "safeCommands": {
            "selectedShortQuality": "script/agentctl.sh selected-short-quality",
            "shortsWorkbench": "script/agentctl.sh shorts-review-workbench --json",
            "saveCreativePacket": "script/agentctl.sh selected-short-creative-review-packet-save",
            "platformCleanCopy": "script/agentctl.sh selected-short-platform-clean-copy",
            "audioRhythmProof": "script/agentctl.sh selected-short-audio-rhythm-proof --save",
            "markKeep": "script/agentctl.sh shorts-review-selected keep \"proof watched; ready for Tower handoff\"",
            "markRefine": "script/agentctl.sh shorts-review-selected refine \"needs another edit pass\"",
        },
        "truth": "Proof review checks rendered derivative evidence only. It does not approve, publish, schedule, overwrite exports, or mutate source media.",
    }

    if save and proof_exists:
        folder_text = str(Path(contact_sheet).parent) if contact_sheet else ""
        if folder_text:
            folder = Path(folder_text).resolve()
            (folder / "selected-short-proof-review.json").write_text(json.dumps(review, indent=2, sort_keys=True), encoding="utf-8")
            (folder / "selected-short-proof-review.md").write_text(render_markdown(review), encoding="utf-8")
            review["savedTo"] = str(folder)

    return review


def render_markdown(review: dict[str, Any]) -> str:
    selected = dict_value(review.get("selectedShort"))
    proof = dict_value(review.get("proof"))
    lines = [
        "# Selected Short Proof Review",
        "",
        s(review.get("truth")) or "Proof review only.",
        "",
        f"- Status: `{s(review.get('status'))}`",
        f"- Short: {s(selected.get('title'))}",
        f"- Review status: `{s(selected.get('reviewStatus'))}`",
        f"- Proof path: `{s(proof.get('path')) or 'missing'}`",
        f"- Exists: `{proof.get('exists')}`",
        f"- Streams: video {int(n(proof.get('videoStreamCount')))}, audio {int(n(proof.get('audioStreamCount')))}, data {int(n(proof.get('dataStreamCount'))) }",
        f"- Frame: {int(n(proof.get('width')))}x{int(n(proof.get('height')))} `{s(proof.get('aspect'))}`",
        f"- Duration: {n(proof.get('duration')):.2f}s, A/V spread {n(proof.get('durationSpreadSeconds')):.2f}s",
    ]
    if s(proof.get("contactSheetPath")):
        lines.append(f"- Contact sheet: `{s(proof.get('contactSheetPath'))}`")

    lines.extend(["", "## Strengths"])
    strengths = review.get("strengths") or []
    if not strengths:
        lines.append("- none yet")
    else:
        lines.extend(f"- {s(item)}" for item in strengths)

    lines.extend(["", "## Warnings"])
    warnings = review.get("warnings") or []
    if not warnings:
        lines.append("- none")
    else:
        lines.extend(f"- {s(item)}" for item in warnings)

    lines.extend(["", "## Next actions"])
    for item in review.get("nextActions") or []:
        lines.append(f"- {s(item)}")

    lines.extend(["", "## Safe commands"])
    for label, command in dict_value(review.get("safeCommands")).items():
        lines.append(f"- {label}: `{command}`")
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Review selected short rendered proof evidence.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT))
    parser.add_argument("--save", action="store_true", help="Save JSON, Markdown, and contact sheet under output root.")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    args = parser.parse_args()

    review = build_review(args.base_url, args.save, Path(args.output_root))
    if args.json:
        print(json.dumps(review, indent=2, sort_keys=True))
    else:
        print(render_markdown(review), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
