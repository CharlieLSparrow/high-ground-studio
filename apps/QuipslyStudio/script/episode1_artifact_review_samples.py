#!/usr/bin/env python3
"""Generate short Episode 1 review samples from full-length artifacts.

These are operator review aids. They do not approve artifacts, publish, upload,
schedule, or capture receipts.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REVIEW_ARTIFACT_IDS = {
    "episode-16x9-master",
    "episode-9x16-master",
    "podcast-audio-master",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def load_json(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: str, payload: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")


def run(args: list[str], timeout: int = 120) -> dict[str, Any]:
    try:
        result = subprocess.run(
            args,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
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
        return {
            "command": args,
            "exitCode": None,
            "stdout": stdout[-12000:],
            "stderr": stderr[-12000:],
            "timedOut": True,
        }


def find_binary(name: str) -> str:
    for prefix in ("/opt/homebrew/bin", "/usr/local/bin"):
        candidate = f"{prefix}/{name}"
        if os.path.exists(candidate):
            return candidate
    return name


def safe_name(value: str) -> str:
    return "".join(char if char.isalnum() else "-" for char in value).strip("-").lower()


def timestamp(seconds: float) -> str:
    whole = max(0, int(round(seconds)))
    return f"{whole // 3600:02d}:{(whole % 3600) // 60:02d}:{whole % 60:02d}"


def as_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def sample_points(duration: float, expected_audio_end: float | None = None) -> list[dict[str, Any]]:
    points = [
        {"id": "start", "label": "Opening sample", "start": 0.0, "duration": 20.0},
    ]
    if duration > 240:
        points.append(
            {
                "id": "middle",
                "label": "Middle sample",
                "start": max(0.0, duration / 2.0 - 10.0),
                "duration": 20.0,
            }
        )
    if expected_audio_end and expected_audio_end > 30 and duration > expected_audio_end + 5:
        points.append(
            {
                "id": "audio-end-boundary",
                "label": "Expected audio-end boundary sample",
                "start": max(0.0, expected_audio_end - 20.0),
                "duration": 40.0,
            }
        )
    if duration > 90:
        points.append(
            {
                "id": "tail-warning",
                "label": "Near-end tail sample",
                "start": max(0.0, duration - 35.0),
                "duration": min(30.0, duration),
            }
        )
    return points


def make_sample(source: str, artifact_id: str, point: dict[str, Any], output_dir: str) -> dict[str, Any]:
    ffmpeg = find_binary("ffmpeg")
    ext = ".m4a" if artifact_id == "podcast-audio-master" else ".mp4"
    output_path = os.path.join(output_dir, f"{safe_name(artifact_id)}-{point['id']}{ext}")
    args = [
        ffmpeg,
        "-hide_banner",
        "-y",
        "-ss",
        f"{point['start']:.3f}",
        "-t",
        f"{point['duration']:.3f}",
        "-i",
        source,
    ]
    if artifact_id == "podcast-audio-master":
        args.extend(["-vn", "-c:a", "aac", "-b:a", "160k", output_path])
    else:
        args.extend(
            [
                "-map",
                "0:v:0",
                "-map",
                "0:a:0?",
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "25",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "160k",
                "-movflags",
                "+faststart",
                output_path,
            ]
        )
    result = run(args, timeout=180)
    return {
        "sampleId": point["id"],
        "label": point["label"],
        "sourceStartSeconds": round(float(point["start"]), 3),
        "sourceStartTimecode": timestamp(float(point["start"])),
        "durationSeconds": round(float(point["duration"]), 3),
        "path": output_path,
        "exists": os.path.exists(output_path),
        "exitCode": result["exitCode"],
        "timedOut": result["timedOut"],
        "stderrTail": result["stderr"][-3000:],
    }


def markdown(packet: dict[str, Any]) -> str:
    lines = [
        "# Episode 1 artifact review samples",
        "",
        f"Generated: {packet['generatedAt']}",
        "",
        f"Status: `{packet['status']}`",
        "",
        "These short samples are review aids cut from the full-length Episode 1 artifacts. They make start, middle, and near-end checks easier. They are not approval.",
        "",
        f"JSON packet: `{packet['writtenTo']}`",
        f"Output folder: `{packet['outputDir']}`",
        "",
        "## Review purpose",
        "",
        "- Opening samples catch accidental slate, wrong start, wrong asset, or silent intro.",
        "- Middle samples catch gross sync/export problems without a full watch.",
        "- Near-end samples specifically target the video-master tail-audio warning from the machine sanity review.",
        "",
    ]
    for artifact in packet["artifacts"]:
        lines.extend(
            [
                f"## {artifact['artifactId']}",
                "",
                f"- Source: `{artifact['sourcePath']}`",
                f"- Samples requested: `{len(artifact['samples'])}`",
                f"- Samples written: `{sum(1 for sample in artifact['samples'] if sample['exists'])}`",
                "",
            ]
        )
        for sample in artifact["samples"]:
            lines.extend(
                [
                    f"### {sample['label']}",
                    "",
                    f"- Source time: `{sample['sourceStartTimecode']}`",
                    f"- Duration: `{sample['durationSeconds']}` seconds",
                    f"- Path: `{sample['path']}`",
                    f"- Exists: `{sample['exists']}`",
                    f"- ffmpeg exit: `{sample['exitCode']}`",
                    "",
                ]
            )
    lines.extend(
        [
            "## Truth boundary",
            "",
            "- These clips are sampled evidence only.",
            "- They do not prove full playback, final pacing, selected shorts, or publication readiness.",
            "- If a sample reveals a problem, route the issue back to Studio before Tower readiness claims.",
            "",
        ]
    )
    return "\n".join(lines) + "\n"


def main() -> int:
    if len(sys.argv) != 8:
        print(
            "usage: episode1_artifact_review_samples.py proof.json output-dir output.json output.md action-queue.json studio-queue.json writing-status.json",
            file=sys.stderr,
        )
        return 2

    proof_path, output_dir, output_json, output_md, action_queue_path, studio_queue_path, writing_status_path = sys.argv[1:8]
    proof = load_json(proof_path)
    os.makedirs(output_dir, exist_ok=True)
    proof_artifacts = proof.get("artifacts", [])
    podcast_duration = next(
        (
            as_float(item.get("durationSeconds"))
            for item in proof_artifacts
            if item.get("artifactId") == "podcast-audio-master"
        ),
        None,
    )

    artifacts: list[dict[str, Any]] = []
    for item in proof_artifacts:
        artifact_id = item.get("artifactId")
        if artifact_id not in REVIEW_ARTIFACT_IDS:
            continue
        source = item.get("path") or ""
        duration = as_float(item.get("durationSeconds")) or 0.0
        samples = []
        if os.path.exists(source) and duration > 0:
            expected_audio_end = podcast_duration if artifact_id in {"episode-16x9-master", "episode-9x16-master"} else None
            for point in sample_points(duration, expected_audio_end):
                samples.append(make_sample(source, artifact_id, point, output_dir))
        artifacts.append(
            {
                "artifactId": artifact_id,
                "sourcePath": source,
                "durationSeconds": duration,
                "exists": os.path.exists(source),
                "samples": samples,
            }
        )

    failed = [
        sample
        for artifact in artifacts
        for sample in artifact["samples"]
        if not sample["exists"] or sample["exitCode"] != 0
    ]
    status = "review-samples-generated-needs-watch-listen-review"
    if failed:
        status = "review-samples-generated-with-failures"

    packet = {
        "packetType": "quipsly-artifact-review-samples",
        "version": "2026-06-20.artifact-review-samples.v1",
        "projectSlug": proof.get("projectSlug", "high-ground-odyssey-manuscript"),
        "episodeSlug": proof.get("episodeSlug", "episode-1"),
        "generatedAt": now_iso(),
        "sourceProofReview": proof_path,
        "outputDir": output_dir,
        "writtenTo": output_json,
        "markdown": output_md,
        "status": status,
        "failedSampleCount": len(failed),
        "artifacts": artifacts,
        "truth": "These review samples are operator aids. They do not perform full watch/listen review, approve, publish, upload, schedule, or capture receipts.",
    }
    write_json(output_json, packet)
    with open(output_md, "w", encoding="utf-8") as handle:
        handle.write(markdown(packet))

    for path in (action_queue_path, studio_queue_path, writing_status_path):
        payload = load_json(path)
        payload["updatedAt"] = packet["generatedAt"]
        if path == action_queue_path:
            payload["currentArtifactReviewSamples"] = output_json
            payload["currentArtifactReviewSamplesMarkdown"] = output_md
            payload.setdefault("operatorCommands", {})["generateArtifactReviewSamples"] = "script/agentctl.sh episode1-artifact-review-samples"
        elif path == studio_queue_path:
            payload["currentArtifactReviewSamples"] = output_json
            payload["currentArtifactReviewSamplesMarkdown"] = output_md
            payload.setdefault("operatorCommands", {})["generateArtifactReviewSamples"] = "script/agentctl.sh episode1-artifact-review-samples"
        else:
            payload.setdefault("authoritativeArtifacts", {})["artifactReviewSamples"] = output_json
            payload.setdefault("authoritativeArtifacts", {})["artifactReviewSamplesMarkdown"] = output_md
            payload.setdefault("operatorCommands", {})["generateArtifactReviewSamples"] = "script/agentctl.sh episode1-artifact-review-samples"
        write_json(path, payload)

    print(
        json.dumps(
            {
                "packetType": "quipsly-artifact-review-samples-result",
                "status": status,
                "writtenTo": output_json,
                "markdown": output_md,
                "outputDir": output_dir,
                "failedSampleCount": len(failed),
                "truth": packet["truth"],
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
