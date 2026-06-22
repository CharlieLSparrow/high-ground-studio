#!/usr/bin/env python3
"""Machine sanity check for Episode 1 tail-trim candidate artifacts.

This verifies candidate artifact paths, durations, streams, and focused ending
samples. It does not approve artifacts and does not replace watch/listen review.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from typing import Any

REQUIRED_ARTIFACT_IDS = {"episode-16x9-master", "episode-9x16-master", "podcast-audio-master"}
EXPECTED_VIDEO = {
    "episode-16x9-master": (1920, 1080),
    "episode-9x16-master": (1080, 1920),
}
EXPECTED_ENDING_SAMPLE_SECONDS = 30.0
CONTACT_SHEET_WIDTH = 320


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def find_binary(name: str) -> str:
    for prefix in ("/opt/homebrew/bin", "/usr/local/bin"):
        candidate = f"{prefix}/{name}"
        if os.path.exists(candidate):
            return candidate
    return name


def run(args: list[str], timeout: int = 120) -> dict[str, Any]:
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


def ffprobe(path: str) -> dict[str, Any]:
    if not path or not os.path.exists(path):
        return {"exists": False, "error": "missing file", "path": path}
    result = run([
        find_binary("ffprobe"),
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=index,codec_type,codec_name,width,height,avg_frame_rate,duration",
        "-of",
        "json",
        path,
    ])
    if result["exitCode"] != 0:
        return {"exists": True, "error": "ffprobe failed", "path": path, "stderrTail": result["stderr"][-3000:]}
    try:
        payload = json.loads(result["stdout"] or "{}")
    except json.JSONDecodeError as error:
        return {"exists": True, "error": f"ffprobe JSON parse failed: {error}", "path": path, "stdoutTail": result["stdout"][-3000:]}
    streams = payload.get("streams") or []
    return {
        "exists": True,
        "path": path,
        "durationSeconds": as_float((payload.get("format") or {}).get("duration")),
        "streams": streams,
        "videoStreams": [s for s in streams if s.get("codec_type") == "video"],
        "audioStreams": [s for s in streams if s.get("codec_type") == "audio"],
    }


def audio_volume(path: str) -> dict[str, Any]:
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
    ], timeout=180)
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


def contact_sheet_path(sample_path: str, artifact_id: str) -> str:
    folder = os.path.dirname(sample_path)
    base = os.path.splitext(os.path.basename(sample_path))[0]
    return os.path.join(folder, f"{base}-contact-sheet.jpg")


def create_contact_sheet(sample_path: str, artifact_id: str) -> dict[str, Any]:
    if not sample_path or not os.path.exists(sample_path):
        return {"exists": False, "error": "sample file missing", "path": None}
    output_path = contact_sheet_path(sample_path, artifact_id)
    result = run([
        find_binary("ffmpeg"),
        "-hide_banner",
        "-y",
        "-i",
        sample_path,
        "-vf",
        f"fps=1/5,scale={CONTACT_SHEET_WIDTH}:-1,tile=3x2",
        "-frames:v",
        "1",
        output_path,
    ], timeout=180)
    return {
        "path": output_path,
        "exists": os.path.exists(output_path),
        "exitCode": result.get("exitCode"),
        "timedOut": result.get("timedOut"),
        "stderrTail": result.get("stderr", "")[-3000:],
    }


def inspect_artifact(item: dict[str, Any], target_duration: float | None) -> dict[str, Any]:
    artifact_id = item.get("artifactId")
    artifact_path = item.get("outputPath")
    sample = item.get("candidateEndingSample") or {}
    sample_path = sample.get("path")
    artifact_probe = ffprobe(artifact_path)
    sample_probe = ffprobe(sample_path)
    sample_audio = audio_volume(sample_path) if sample_probe.get("audioStreams") else {"hasMeasuredAudio": False, "reason": "no audio stream found"}
    sample_contact_sheet = create_contact_sheet(sample_path, artifact_id) if sample_probe.get("videoStreams") else None
    warnings: list[str] = []
    errors: list[str] = []

    if artifact_id not in REQUIRED_ARTIFACT_IDS:
        warnings.append("unexpected artifact id")
    if not artifact_probe.get("exists"):
        errors.append("candidate artifact missing")
    if artifact_probe.get("error"):
        errors.append(str(artifact_probe.get("error")))
    if not sample_probe.get("exists"):
        errors.append("candidate ending sample missing")
    if sample_probe.get("error"):
        errors.append(str(sample_probe.get("error")))

    duration = as_float(artifact_probe.get("durationSeconds"))
    if target_duration and duration and abs(duration - target_duration) > 1.0:
        warnings.append(f"candidate duration differs from target by {abs(duration - target_duration):.3f}s")

    if artifact_id in EXPECTED_VIDEO:
        expected_width, expected_height = EXPECTED_VIDEO[artifact_id]
        videos = artifact_probe.get("videoStreams") or []
        if not videos:
            errors.append("candidate video artifact has no video stream")
        else:
            width = videos[0].get("width")
            height = videos[0].get("height")
            if (width, height) != (expected_width, expected_height):
                warnings.append(f"candidate video resolution is {width}x{height}; expected {expected_width}x{expected_height}")
        if not artifact_probe.get("audioStreams"):
            warnings.append("candidate video artifact has no audio stream")
    elif artifact_id == "podcast-audio-master":
        if artifact_probe.get("videoStreams"):
            warnings.append("podcast audio candidate has an unexpected video stream")
        if not artifact_probe.get("audioStreams"):
            errors.append("podcast audio candidate has no audio stream")

    sample_duration = as_float(sample_probe.get("durationSeconds"))
    if sample_duration and abs(sample_duration - EXPECTED_ENDING_SAMPLE_SECONDS) > 2.0:
        warnings.append(f"ending sample duration is {sample_duration:.3f}s; expected about {EXPECTED_ENDING_SAMPLE_SECONDS:.0f}s")
    if not sample_probe.get("audioStreams"):
        warnings.append("ending sample has no audio stream")
    if sample_audio.get("hasMeasuredAudio") and sample_audio.get("maxVolumeDb") is not None and sample_audio["maxVolumeDb"] < -55:
        warnings.append("ending sample measured very quiet audio")
    if sample_probe.get("videoStreams") and (not sample_contact_sheet or not sample_contact_sheet.get("exists")):
        warnings.append("ending sample contact sheet could not be generated")

    return {
        "artifactId": artifact_id,
        "candidatePath": artifact_path,
        "candidateExists": artifact_probe.get("exists"),
        "candidateDurationSeconds": duration,
        "candidateVideoStreamCount": len(artifact_probe.get("videoStreams") or []),
        "candidateAudioStreamCount": len(artifact_probe.get("audioStreams") or []),
        "candidateVideoResolution": (
            f"{(artifact_probe.get('videoStreams') or [{}])[0].get('width')}x{(artifact_probe.get('videoStreams') or [{}])[0].get('height')}"
            if artifact_probe.get("videoStreams")
            else None
        ),
        "endingSamplePath": sample_path,
        "endingSampleExists": sample_probe.get("exists"),
        "endingSampleDurationSeconds": sample_duration,
        "endingSampleAudioStreamCount": len(sample_probe.get("audioStreams") or []),
        "endingSampleVolume": sample_audio,
        "endingSampleContactSheet": sample_contact_sheet,
        "warnings": warnings,
        "errors": errors,
        "status": "error" if errors else ("warning" if warnings else "ok"),
    }


def markdown(packet: dict[str, Any]) -> str:
    lines = [
        "# Episode 1 tail-trim candidate machine sanity",
        "",
        f"Generated: {packet['generatedAt']}",
        "",
        f"Status: `{packet['status']}`",
        "",
        "This is a machine preflight over the non-destructive tail-trim candidate and ending samples. It does not replace watch/listen review.",
        "",
        f"Candidate packet: `{packet['sourceTailTrimCandidate']}`",
        "",
        "## Findings",
        "",
        f"- Error count: `{packet['errorCount']}`",
        f"- Warning count: `{packet['warningCount']}`",
        "",
    ]
    for item in packet.get("artifacts", []):
        lines.extend([
            f"### {item['artifactId']}",
            "",
            f"- Status: `{item['status']}`",
            f"- Candidate: `{item['candidatePath']}`",
            f"- Candidate duration: `{item['candidateDurationSeconds']}`",
            f"- Candidate streams: video `{item['candidateVideoStreamCount']}`, audio `{item['candidateAudioStreamCount']}`",
            f"- Ending sample: `{item['endingSamplePath']}`",
            f"- Ending sample duration: `{item['endingSampleDurationSeconds']}`",
            f"- Ending sample max volume dB: `{(item.get('endingSampleVolume') or {}).get('maxVolumeDb')}`",
            f"- Ending sample contact sheet: `{(item.get('endingSampleContactSheet') or {}).get('path')}`",
            f"- Warnings: `{item['warnings']}`",
            f"- Errors: `{item['errors']}`",
            "",
        ])
    lines.extend([
        "## Truth boundary",
        "",
        packet["truth"],
        "",
    ])
    return "\n".join(lines)


def main() -> int:
    if len(sys.argv) != 7:
        print("usage: episode1_tail_trim_candidate_sanity.py candidate.json output.json output.md action-queue.json studio-queue.json writing-status.json", file=sys.stderr)
        return 2

    candidate_path, output_json, output_md, action_queue_path, studio_queue_path, writing_status_path = sys.argv[1:7]
    candidate = load_json(candidate_path)
    target_duration = as_float(candidate.get("targetDurationSeconds"))
    artifacts = [inspect_artifact(item, target_duration) for item in candidate.get("artifacts", [])]
    error_count = sum(len(item.get("errors") or []) for item in artifacts)
    warning_count = sum(len(item.get("warnings") or []) for item in artifacts)
    packet = {
        "packetType": "quipsly-tail-trim-candidate-machine-sanity",
        "version": "2026-06-20.tail-trim-candidate-sanity.v1",
        "projectSlug": candidate.get("projectSlug", "high-ground-odyssey-manuscript"),
        "episodeSlug": candidate.get("episodeSlug", "episode-1"),
        "generatedAt": now_iso(),
        "sourceTailTrimCandidate": candidate_path,
        "targetDurationSeconds": target_duration,
        "status": "tail-trim-candidate-machine-sanity-ok" if error_count == 0 else "tail-trim-candidate-machine-sanity-error",
        "errorCount": error_count,
        "warningCount": warning_count,
        "artifacts": artifacts,
        "truth": "This is a machine preflight for tail-trim candidate artifacts and ending samples. It does not approve artifacts, replace originals, publish, upload, schedule, or capture receipts.",
    }
    write_json(output_json, packet)
    with open(output_md, "w", encoding="utf-8") as handle:
        handle.write(markdown(packet))
        handle.write("\n")

    for path in (action_queue_path, studio_queue_path, writing_status_path):
        payload = load_json(path)
        payload["updatedAt"] = packet["generatedAt"]
        if path == action_queue_path:
            payload["currentTailTrimCandidateSanity"] = output_json
            payload["currentTailTrimCandidateSanityMarkdown"] = output_md
            payload.setdefault("operatorCommands", {})["tailTrimCandidateSanity"] = "script/agentctl.sh episode1-tail-trim-candidate-sanity"
        elif path == studio_queue_path:
            payload["currentTailTrimCandidateSanity"] = output_json
            payload["currentTailTrimCandidateSanityMarkdown"] = output_md
            payload.setdefault("operatorCommands", {})["tailTrimCandidateSanity"] = "script/agentctl.sh episode1-tail-trim-candidate-sanity"
        else:
            payload.setdefault("authoritativeArtifacts", {})["tailTrimCandidateSanity"] = output_json
            payload.setdefault("authoritativeArtifacts", {})["tailTrimCandidateSanityMarkdown"] = output_md
            payload.setdefault("operatorCommands", {})["tailTrimCandidateSanity"] = "script/agentctl.sh episode1-tail-trim-candidate-sanity"
        write_json(path, payload)

    print(json.dumps({
        "packetType": "quipsly-tail-trim-candidate-machine-sanity-result",
        "status": packet["status"],
        "errorCount": error_count,
        "warningCount": warning_count,
        "writtenTo": output_json,
        "markdown": output_md,
        "truth": packet["truth"],
    }, indent=2, sort_keys=True))
    return 0 if error_count == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
