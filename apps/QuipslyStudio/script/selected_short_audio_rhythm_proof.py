#!/usr/bin/env python3
"""Analyze selected-short proof audio rhythm.

This is a rendered-proof evidence layer. It uses ffmpeg on the selected short's
proof file to find silence/pause structure and rough volume facts. It does not
transcribe, approve, export, publish, or mutate source media.
"""

from __future__ import annotations

import argparse
import json
import os
import re
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
    build_review,
    dict_value,
    n,
    s,
    slugify,
)


DEFAULT_OUTPUT_ROOT = Path.home() / "Movies" / "QuipslyExports" / "ShortAudioRhythmProofs"

SILENCE_START_RE = re.compile(r"silence_start:\s*([0-9.]+)")
SILENCE_END_RE = re.compile(r"silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)")
MEAN_VOLUME_RE = re.compile(r"mean_volume:\s*(-?[0-9.]+)\s*dB")
MAX_VOLUME_RE = re.compile(r"max_volume:\s*(-?[0-9.]+)\s*dB")


def run_ffmpeg(command: list[str]) -> tuple[int, str]:
    try:
        completed = subprocess.run(command, capture_output=True, text=True)
        return completed.returncode, (completed.stderr or "") + (completed.stdout or "")
    except FileNotFoundError as exc:
        return 127, f"missing tool: {exc.filename}"


def detect_silences(path: Path, noise: str, duration: float) -> tuple[list[dict[str, float]], str]:
    command = [
        "ffmpeg",
        "-hide_banner",
        "-nostats",
        "-i",
        str(path),
        "-af",
        f"silencedetect=noise={noise}:d={duration:.3f}",
        "-f",
        "null",
        "-",
    ]
    code, output = run_ffmpeg(command)
    if code != 0 and "silence_" not in output:
        return [], output.strip()

    silences: list[dict[str, float]] = []
    pending_start: float | None = None
    for line in output.splitlines():
        start_match = SILENCE_START_RE.search(line)
        if start_match:
            pending_start = float(start_match.group(1))
            continue
        end_match = SILENCE_END_RE.search(line)
        if end_match:
            end = float(end_match.group(1))
            silence_duration = float(end_match.group(2))
            start = pending_start if pending_start is not None else max(0.0, end - silence_duration)
            silences.append({"start": start, "end": end, "duration": silence_duration})
            pending_start = None
    return silences, ""


def volume_stats(path: Path) -> tuple[dict[str, float], str]:
    command = [
        "ffmpeg",
        "-hide_banner",
        "-nostats",
        "-i",
        str(path),
        "-af",
        "volumedetect",
        "-f",
        "null",
        "-",
    ]
    code, output = run_ffmpeg(command)
    mean_match = MEAN_VOLUME_RE.search(output)
    max_match = MAX_VOLUME_RE.search(output)
    stats = {
        "meanVolumeDb": float(mean_match.group(1)) if mean_match else 0.0,
        "maxVolumeDb": float(max_match.group(1)) if max_match else 0.0,
    }
    if code != 0 and not mean_match and not max_match:
        return stats, output.strip()
    return stats, ""


def create_waveform(path: Path, output_folder: Path) -> tuple[str, str]:
    output_folder.mkdir(parents=True, exist_ok=True)
    output = output_folder / "waveform.png"
    command = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-n",
        "-i",
        str(path),
        "-filter_complex",
        "aformat=channel_layouts=mono,showwavespic=s=1600x320:colors=5EC8A8",
        "-frames:v",
        "1",
        str(output),
    ]
    code, text = run_ffmpeg(command)
    if output.exists():
        return str(output), ""
    return "", text.strip() if code else ""


def rhythm_assessment(duration: float, silences: list[dict[str, float]], stats: dict[str, float]) -> dict[str, Any]:
    meaningful = [item for item in silences if item["duration"] >= 0.35]
    long_pauses = [item for item in silences if item["duration"] >= 0.70]
    total_silence = sum(item["duration"] for item in silences)
    silence_fraction = total_silence / duration if duration > 0 else 0.0
    pauses_per_minute = len(meaningful) / max(duration / 60.0, 0.001)
    warnings: list[str] = []
    strengths: list[str] = []
    next_actions: list[str] = []

    if duration <= 0:
        warnings.append("Duration is unavailable; audio rhythm cannot be trusted.")
    if not silences:
        warnings.append("No pauses detected at this threshold; the short may be very compressed or the threshold may be too low.")
        next_actions.append("Proof-listen for robotic pacing before marking Keep.")
    elif len(meaningful) == 0:
        warnings.append("Only micro-pauses were detected; check whether the cut has enough conversational breath.")
        next_actions.append("Listen at normal speed for breath, laugh, or thought that may need more air.")
    else:
        strengths.append(f"Detected {len(meaningful)} conversational pause(s) >= 0.35s.")
    if long_pauses:
        next_actions.append("Review long pauses before tightening; they may be useful emphasis or dead air.")
    if silence_fraction > 0.22:
        warnings.append(f"Silence fraction is high at {silence_fraction:.0%}; check for drag or quiet dead air.")
    elif 0.03 <= silence_fraction <= 0.18:
        strengths.append(f"Silence fraction is in a plausible human range at {silence_fraction:.0%}.")
    if stats.get("maxVolumeDb", 0.0) > -0.2:
        warnings.append("Audio peak is very close to clipping; listen for harshness.")
    if stats.get("meanVolumeDb", 0.0) < -32:
        warnings.append("Mean volume is low; proof-listen before platform handoff.")

    next_actions.append("Run `script/agentctl.sh selected-short-rhythm-refinement-plan --save` to convert pause evidence into a non-destructive edit work order.")
    next_actions.append("Generate or attach transcript timing so pause evidence can be tied to words and speaker turns.")
    next_actions.append("Use this as triage only; preserve human cadence unless listening proves the pause is dead air.")
    label = "needs-listen"
    if warnings:
        label = "cadence-review"
    elif strengths:
        label = "rhythm-plausible"

    return {
        "label": label,
        "silenceCount": len(silences),
        "meaningfulPauseCount": len(meaningful),
        "longPauseCount": len(long_pauses),
        "totalSilenceSeconds": total_silence,
        "silenceFraction": silence_fraction,
        "pausesPerMinute": pauses_per_minute,
        "longestPause": max((item["duration"] for item in silences), default=0.0),
        "warnings": warnings,
        "strengths": strengths,
        "nextActions": next_actions,
    }


def build_audio_rhythm_proof(base_url: str, output_root: Path, save: bool, noise: str, min_silence: float) -> dict[str, Any]:
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    proof_review = build_review(base_url, save=False, output_root=output_root)
    selected = dict_value(proof_review.get("selectedShort"))
    proof = dict_value(proof_review.get("proof"))
    proof_path = Path(s(proof.get("path"))).expanduser()

    if not s(proof.get("path")) or not proof_path.exists():
        return {
            "status": "missing-proof",
            "model": "quipslystudio-selected-short-audio-rhythm-proof",
            "generatedAt": generated_at,
            "selectedShort": selected,
            "proofPath": s(proof.get("path")),
            "nextActions": ["Export or repair selected short proof before audio rhythm analysis."],
            "truth": "No audio rhythm proof was generated. Source media and exports remain untouched.",
        }

    duration = n(proof.get("duration")) or n(selected.get("duration"))
    title = s(selected.get("title")) or "selected-short"
    silences, silence_error = detect_silences(proof_path, noise, min_silence)
    stats, volume_error = volume_stats(proof_path)
    assessment = rhythm_assessment(duration, silences, stats)

    folder_text = ""
    waveform = ""
    waveform_error = ""
    if save:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        folder = output_root.expanduser().resolve() / f"{stamp}-{slugify(title)}"
        waveform, waveform_error = create_waveform(proof_path, folder)
        folder_text = str(folder)

    warnings = list(assessment["warnings"])
    if silence_error:
        warnings.append(f"Silence detection warning: {silence_error}")
    if volume_error:
        warnings.append(f"Volume detection warning: {volume_error}")
    if waveform_error:
        warnings.append(f"Waveform was not generated: {waveform_error}")

    payload = {
        "status": assessment["label"],
        "model": "quipslystudio-selected-short-audio-rhythm-proof",
        "generatedAt": generated_at,
        "selectedShort": selected,
        "proofPath": str(proof_path),
        "analysisSettings": {
            "silenceNoise": noise,
            "minimumSilenceSeconds": min_silence,
        },
        "duration": duration,
        "volume": stats,
        "silences": silences[:80],
        "rhythm": {
            key: value
            for key, value in assessment.items()
            if key not in {"warnings", "strengths", "nextActions"}
        },
        "strengths": assessment["strengths"],
        "warnings": warnings,
        "nextActions": assessment["nextActions"],
        "waveformPath": waveform,
        "proofReview": proof_review,
        "truth": "Audio rhythm proof reads the rendered selected-short derivative only. It does not transcribe, approve, publish, overwrite, or mutate source media.",
    }
    if folder_text:
        folder_path = Path(folder_text)
        folder_path.mkdir(parents=True, exist_ok=True)
        (folder_path / "selected-short-audio-rhythm-proof.json").write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        (folder_path / "selected-short-audio-rhythm-proof.md").write_text(render_markdown(payload), encoding="utf-8")
        payload["savedTo"] = folder_text
    return payload


def render_markdown(payload: dict[str, Any]) -> str:
    selected = dict_value(payload.get("selectedShort"))
    rhythm = dict_value(payload.get("rhythm"))
    volume = dict_value(payload.get("volume"))
    lines = [
        "# Selected Short Audio Rhythm Proof",
        "",
        s(payload.get("truth")) or "Rendered-audio proof only.",
        "",
        f"- Status: `{s(payload.get('status'))}`",
        f"- Short: {s(selected.get('title'))}",
        f"- Review status: `{s(selected.get('reviewStatus')) or 'unknown'}`",
        f"- Proof: `{s(payload.get('proofPath'))}`",
        f"- Duration: {n(payload.get('duration')):.2f}s",
        f"- Silences: {int(n(rhythm.get('silenceCount')))} total, {int(n(rhythm.get('meaningfulPauseCount')))} conversational, {int(n(rhythm.get('longPauseCount')))} long",
        f"- Silence fraction: {n(rhythm.get('silenceFraction')):.0%}",
        f"- Pauses/minute: {n(rhythm.get('pausesPerMinute')):.1f}",
        f"- Longest pause: {n(rhythm.get('longestPause')):.2f}s",
        f"- Volume: mean {n(volume.get('meanVolumeDb')):.1f} dB, max {n(volume.get('maxVolumeDb')):.1f} dB",
    ]
    if s(payload.get("waveformPath")):
        lines.append(f"- Waveform: `{s(payload.get('waveformPath'))}`")

    lines.extend(["", "## Strengths"])
    strengths = payload.get("strengths") or []
    lines.extend(f"- {s(item)}" for item in strengths) if strengths else lines.append("- none yet")

    lines.extend(["", "## Warnings"])
    warnings = payload.get("warnings") or []
    lines.extend(f"- {s(item)}" for item in warnings) if warnings else lines.append("- none")

    lines.extend(["", "## Next actions"])
    for item in payload.get("nextActions") or []:
        lines.append(f"- {s(item)}")

    first_silences = payload.get("silences") or []
    if first_silences:
        lines.extend(["", "## First detected pauses"])
        for item in first_silences[:8]:
            if isinstance(item, dict):
                lines.append(f"- {n(item.get('start')):.2f}s -> {n(item.get('end')):.2f}s ({n(item.get('duration')):.2f}s)")

    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Analyze rendered selected-short proof audio rhythm.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT))
    parser.add_argument("--noise", default="-35dB")
    parser.add_argument("--min-silence", type=float, default=0.18)
    parser.add_argument("--save", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    args = parser.parse_args()

    payload = build_audio_rhythm_proof(args.base_url, Path(args.output_root), args.save, args.noise, args.min_silence)
    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(payload), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
