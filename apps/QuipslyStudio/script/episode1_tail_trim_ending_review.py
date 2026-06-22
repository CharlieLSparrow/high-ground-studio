#!/usr/bin/env python3
"""Build a delegated ending-review evidence packet for Episode 1 tail trim.

This strengthens the review surface for the tail-trim candidate by inspecting
the focused ending samples. It can create still-frame evidence and audio volume
summaries, but it does not promote the candidate or approve artifacts.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from typing import Any


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def find_binary(name: str) -> str:
    for prefix in ("/opt/homebrew/bin", "/usr/local/bin"):
        candidate = f"{prefix}/{name}"
        if os.path.exists(candidate):
            return candidate
    return name


def run(args: list[str], timeout: int = 180) -> dict[str, Any]:
    try:
        result = subprocess.run(args, capture_output=True, text=True, check=False, timeout=timeout)
        return {
            "command": args,
            "exitCode": result.returncode,
            "stdout": result.stdout[-12000:],
            "stderr": result.stderr[-12000:],
            "timedOut": False,
        }
    except subprocess.TimeoutExpired as error:
        stdout = error.stdout if isinstance(error.stdout, str) else ""
        stderr = error.stderr if isinstance(error.stderr, str) else ""
        return {"command": args, "exitCode": None, "stdout": stdout[-12000:], "stderr": stderr[-12000:], "timedOut": True}


def load_json(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: str, payload: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")


def as_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def ffprobe(path: str | None) -> dict[str, Any]:
    if not path or not os.path.exists(path):
        return {"exists": False, "path": path, "error": "missing file"}
    result = run([
        find_binary("ffprobe"),
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=index,codec_type,codec_name,width,height",
        "-of",
        "json",
        path,
    ])
    if result["exitCode"] != 0:
        return {"exists": True, "path": path, "error": "ffprobe failed", "stderrTail": result["stderr"][-3000:]}
    try:
        payload = json.loads(result["stdout"] or "{}")
    except json.JSONDecodeError as error:
        return {"exists": True, "path": path, "error": f"ffprobe JSON parse failed: {error}"}
    streams = payload.get("streams") or []
    return {
        "exists": True,
        "path": path,
        "durationSeconds": as_float((payload.get("format") or {}).get("duration")),
        "videoStreamCount": len([s for s in streams if s.get("codec_type") == "video"]),
        "audioStreamCount": len([s for s in streams if s.get("codec_type") == "audio"]),
        "streams": streams,
    }


def audio_volume(path: str | None) -> dict[str, Any]:
    if not path or not os.path.exists(path):
        return {"exists": False, "error": "missing file"}
    result = run([
        find_binary("ffmpeg"),
        "-hide_banner",
        "-nostats",
        "-i",
        path,
        "-vn",
        "-af",
        "volumedetect",
        "-f",
        "null",
        "-",
    ])
    text = (result.get("stderr") or "") + "\n" + (result.get("stdout") or "")
    mean_match = re.search(r"mean_volume:\s*([-0-9.]+) dB", text)
    max_match = re.search(r"max_volume:\s*([-0-9.]+) dB", text)
    return {
        "exitCode": result.get("exitCode"),
        "timedOut": result.get("timedOut"),
        "meanVolumeDb": as_float(mean_match.group(1)) if mean_match else None,
        "maxVolumeDb": as_float(max_match.group(1)) if max_match else None,
        "hasMeasuredAudio": bool(mean_match or max_match),
        "stderrTail": result.get("stderr", "")[-3000:],
    }


def ending_still(path: str | None, output_dir: str, artifact_id: str, duration: float | None) -> dict[str, Any]:
    if not path or not os.path.exists(path):
        return {"exists": False, "path": None, "error": "missing sample"}
    if not duration or duration <= 0:
        return {"exists": False, "path": None, "error": "missing duration"}
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, f"{artifact_id}-ending-last-frame.jpg")
    seek_time = max(0.0, duration - 0.4)
    result = run([
        find_binary("ffmpeg"),
        "-hide_banner",
        "-y",
        "-ss",
        f"{seek_time:.3f}",
        "-i",
        path,
        "-frames:v",
        "1",
        output_path,
    ])
    return {
        "path": output_path,
        "exists": os.path.exists(output_path),
        "seekSeconds": seek_time,
        "exitCode": result.get("exitCode"),
        "timedOut": result.get("timedOut"),
        "stderrTail": result.get("stderr", "")[-3000:],
    }


def markdown(packet: dict[str, Any]) -> str:
    lines = [
        "# Episode 1 tail-trim ending review evidence",
        "",
        f"Generated: {packet['generatedAt']}",
        "",
        f"Status: `{packet['status']}`",
        "",
        "This packet is delegated review support. It is not an approval.",
        "",
        "## Evidence summary",
        "",
    ]
    for item in packet["sampleReviews"]:
        lines.extend(
            [
                f"### {item['artifactId']}",
                "",
                f"- Sample: `{item['samplePath']}`",
                f"- Exists: `{item['probe'].get('exists')}`",
                f"- Duration: `{item['probe'].get('durationSeconds')}`",
                f"- Streams: video `{item['probe'].get('videoStreamCount')}`, audio `{item['probe'].get('audioStreamCount')}`",
                f"- Audio max volume: `{item['audioVolume'].get('maxVolumeDb')}` dB",
                f"- Last frame: `{(item.get('endingStill') or {}).get('path')}`",
                f"- Warnings: `{len(item['warnings'])}`",
                f"- Errors: `{len(item['errors'])}`",
                "",
            ]
        )
        for warning in item["warnings"]:
            lines.append(f"  - warning: {warning}")
        for error in item["errors"]:
            lines.append(f"  - error: {error}")
        if item["warnings"] or item["errors"]:
            lines.append("")
    lines.extend(
        [
            "## Safe next commands",
            "",
            f"- Open review launcher: `{packet['safeCommands']['openLauncher']}`",
            f"- Select candidate after real review: `{packet['safeCommands']['selectCandidateForReview']}`",
            f"- Reject candidate: `{packet['safeCommands']['rejectCandidate']}`",
            "",
            "## Truth boundary",
            "",
            packet["truth"],
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    if len(sys.argv) != 5:
        print("usage: episode1_tail_trim_ending_review.py handoff.json output.json output.md evidence-dir", file=sys.stderr)
        return 2

    handoff_path, output_json, output_md, evidence_dir = sys.argv[1:5]
    handoff = load_json(handoff_path)
    reviews: list[dict[str, Any]] = []
    total_errors = 0
    total_warnings = 0

    for item in handoff.get("tailTrimCandidateArtifacts") or []:
        artifact_id = item.get("artifactId")
        sample_path = item.get("endingSamplePath")
        probe = ffprobe(sample_path)
        volume = audio_volume(sample_path) if probe.get("audioStreamCount") else {"hasMeasuredAudio": False, "reason": "no audio stream"}
        still = None
        if probe.get("videoStreamCount"):
            still = ending_still(sample_path, evidence_dir, artifact_id, probe.get("durationSeconds"))
        warnings: list[str] = []
        errors: list[str] = []
        if not probe.get("exists"):
            errors.append("ending sample missing")
        if probe.get("error"):
            errors.append(str(probe.get("error")))
        duration = probe.get("durationSeconds")
        if duration is None or duration < 20:
            warnings.append("ending sample is shorter than expected review window")
        if probe.get("audioStreamCount") and not volume.get("hasMeasuredAudio"):
            warnings.append("audio stream exists but volume could not be measured")
        if volume.get("hasMeasuredAudio") and volume.get("maxVolumeDb") is not None and volume["maxVolumeDb"] < -55:
            warnings.append("ending sample audio appears very quiet")
        if probe.get("videoStreamCount") and (not still or not still.get("exists")):
            warnings.append("ending last-frame still could not be generated")
        total_errors += len(errors)
        total_warnings += len(warnings)
        reviews.append(
            {
                "artifactId": artifact_id,
                "samplePath": sample_path,
                "probe": probe,
                "audioVolume": volume,
                "endingStill": still,
                "warnings": warnings,
                "errors": errors,
            }
        )

    status = "ending-evidence-ready-needs-human-or-delegated-review"
    if total_errors:
        status = "ending-evidence-has-errors-do-not-promote"
    elif total_warnings:
        status = "ending-evidence-has-warnings-needs-careful-review"

    packet = {
        "packetType": "quipsly-episode1-tail-trim-ending-review-evidence",
        "version": "2026-06-20.tail-ending-review-evidence.v1",
        "projectSlug": handoff.get("projectSlug"),
        "episodeSlug": handoff.get("episodeSlug"),
        "generatedAt": now_iso(),
        "status": status,
        "sourceHandoff": handoff_path,
        "sampleReviews": reviews,
        "errorCount": total_errors,
        "warningCount": total_warnings,
        "safeCommands": {
            "openLauncher": "script/agentctl.sh episode1-artifact-review-launch --open",
            "selectCandidateForReview": handoff.get("safeCommands", {}).get("selectTailTrimCandidateForReview"),
            "rejectCandidate": handoff.get("safeCommands", {}).get("rejectTailTrimCandidate"),
        },
        "blockedClaims": handoff.get("blockedClaims") or [],
        "truth": "This packet strengthens ending-review evidence for the tail-trim candidate. It does not select the candidate, approve artifacts, publish, upload, schedule, or capture receipts. Human or explicitly delegated creative review is still required before promotion.",
    }

    write_json(output_json, packet)
    os.makedirs(os.path.dirname(output_md) or ".", exist_ok=True)
    with open(output_md, "w", encoding="utf-8") as handle:
        handle.write(markdown(packet))
    print(json.dumps({
        "packetType": "quipsly-episode1-tail-trim-ending-review-evidence-result",
        "status": status,
        "output": output_json,
        "markdown": output_md,
        "errorCount": total_errors,
        "warningCount": total_warnings,
        "truth": packet["truth"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
