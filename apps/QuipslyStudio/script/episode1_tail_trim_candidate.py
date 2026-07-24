#!/usr/bin/env python3
"""Create non-destructive Episode 1 tail-trim candidate artifacts.

The current full video masters run longer than their longest audio stream.
This script creates review candidates trimmed to the program audio duration.
It never overwrites the source exports and never marks artifacts approved.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


VIDEO_IDS = {"episode-16x9-master", "episode-9x16-master"}
AUDIO_ID = "podcast-audio-master"
REVIEW_SAMPLE_SECONDS = 30.0


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


def run(args: list[str], timeout: int = 1800) -> dict[str, Any]:
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


def as_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def ffprobe_duration(path: str) -> float | None:
    ffprobe = find_binary("ffprobe")
    result = run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=nokey=1:noprint_wrappers=1",
            path,
        ],
        timeout=60,
    )
    if result["exitCode"] != 0:
        return None
    return as_float((result["stdout"] or "").strip())


def safe_basename(path: str, suffix: str) -> str:
    source = Path(path)
    return f"{source.stem}{suffix}{source.suffix}"


def trim_video(source_path: str, output_path: str, duration: float) -> dict[str, Any]:
    ffmpeg = find_binary("ffmpeg")
    args = [
        ffmpeg,
        "-hide_banner",
        "-y",
        "-i",
        source_path,
        "-t",
        f"{duration:.3f}",
        "-map",
        "0",
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        output_path,
    ]
    result = run(args, timeout=1800)
    return {
        "sourcePath": source_path,
        "outputPath": output_path,
        "targetDurationSeconds": duration,
        "exitCode": result["exitCode"],
        "timedOut": result["timedOut"],
        "exists": os.path.exists(output_path),
        "outputDurationSeconds": ffprobe_duration(output_path) if os.path.exists(output_path) else None,
        "stderrTail": result["stderr"][-4000:],
    }


def copy_audio(source_path: str, output_path: str) -> dict[str, Any]:
    ffmpeg = find_binary("ffmpeg")
    args = [
        ffmpeg,
        "-hide_banner",
        "-y",
        "-i",
        source_path,
        "-map",
        "0",
        "-c",
        "copy",
        output_path,
    ]
    result = run(args, timeout=600)
    return {
        "sourcePath": source_path,
        "outputPath": output_path,
        "exitCode": result["exitCode"],
        "timedOut": result["timedOut"],
        "exists": os.path.exists(output_path),
        "outputDurationSeconds": ffprobe_duration(output_path) if os.path.exists(output_path) else None,
        "stderrTail": result["stderr"][-3000:],
    }


def candidate_sample_path(output_dir: str, artifact_id: str, source_path: str) -> str:
    source = Path(source_path)
    sample_dir = os.path.join(output_dir, "review-samples")
    os.makedirs(sample_dir, exist_ok=True)
    suffix = ".m4a" if artifact_id == AUDIO_ID else ".mp4"
    return os.path.join(sample_dir, f"{artifact_id}-candidate-ending-sample{suffix}")


def create_candidate_ending_sample(artifact: dict[str, Any], output_dir: str) -> dict[str, Any]:
    artifact_id = artifact.get("artifactId")
    source_path = artifact.get("outputPath")
    duration = as_float(artifact.get("outputDurationSeconds"))
    if not artifact_id or not source_path or not os.path.exists(source_path) or not duration:
        return {
            "exists": False,
            "error": "candidate output missing or duration unavailable",
            "artifactId": artifact_id,
            "sourcePath": source_path,
        }

    sample_duration = min(REVIEW_SAMPLE_SECONDS, duration)
    start = max(0.0, duration - sample_duration)
    sample_path = candidate_sample_path(output_dir, artifact_id, source_path)
    ffmpeg = find_binary("ffmpeg")
    if artifact_id == AUDIO_ID:
        args = [
            ffmpeg,
            "-hide_banner",
            "-y",
            "-ss",
            f"{start:.3f}",
            "-i",
            source_path,
            "-t",
            f"{sample_duration:.3f}",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            sample_path,
        ]
    else:
        args = [
            ffmpeg,
            "-hide_banner",
            "-y",
            "-ss",
            f"{start:.3f}",
            "-i",
            source_path,
            "-t",
            f"{sample_duration:.3f}",
            "-map",
            "0:v:0",
            "-map",
            "0:a?",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "28",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
            sample_path,
        ]
    result = run(args, timeout=600)
    return {
        "artifactId": artifact_id,
        "sourcePath": source_path,
        "path": sample_path,
        "startSeconds": start,
        "durationSeconds": sample_duration,
        "exists": os.path.exists(sample_path),
        "exitCode": result["exitCode"],
        "timedOut": result["timedOut"],
        "sampleDurationSeconds": ffprobe_duration(sample_path) if os.path.exists(sample_path) else None,
        "stderrTail": result["stderr"][-3000:],
    }


def markdown(packet: dict[str, Any]) -> str:
    lines = [
        "# Episode 1 tail-trim candidate",
        "",
        f"Generated: {packet['generatedAt']}",
        "",
        f"Status: `{packet['status']}`",
        "",
        "This packet creates non-destructive candidate artifacts that trim video masters to the longest program audio duration. It does not overwrite the original full exports and does not approve the candidate.",
        "",
        f"Output folder: `{packet['outputDir']}`",
        "",
        "## Why this exists",
        "",
        f"- Source video duration: about `{packet.get('sourceVideoDurationSeconds')}` seconds.",
        f"- Longest program audio duration: about `{packet.get('targetDurationSeconds')}` seconds.",
        f"- Video tail past audio: about `{packet.get('trimmedTailSeconds')}` seconds.",
        "- The review station should compare this candidate against the original tail before deciding whether to accept a trim.",
        "",
        "## Candidate artifacts",
        "",
    ]
    for artifact in packet.get("artifacts", []):
        lines.extend(
            [
                f"### {artifact.get('artifactId')}",
                "",
                f"- Source: `{artifact.get('sourcePath')}`",
                f"- Candidate: `{artifact.get('outputPath')}`",
                f"- Exists: `{artifact.get('exists')}`",
                f"- Exit code: `{artifact.get('exitCode')}`",
                f"- Candidate duration: `{artifact.get('outputDurationSeconds')}`",
                f"- Ending review sample: `{(artifact.get('candidateEndingSample') or {}).get('path')}`",
                "",
            ]
        )
    lines.extend(
        [
            "## Review decision",
            "",
            "If the candidate fixes the tail cleanly, Studio should promote a reviewed replacement artifact. Do not silently swap it in.",
            "",
            "Suggested decision command if the current originals need a Studio fix:",
            "",
            "```bash",
            'script/agentctl.sh episode1-artifact-watch-review-decision needs-fix "Reviewer Name" "Original video masters run about 135s past longest audio; review tail-trim candidate for replacement."',
            "```",
            "",
            "Truth boundary: this candidate is a proposed Studio fix, not publication readiness.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    if len(sys.argv) != 8:
        print(
            "usage: episode1_tail_trim_candidate.py sanity.json output-dir output-json output-md action-queue.json studio-queue.json writing-status.json",
            file=sys.stderr,
        )
        return 2

    sanity_path, output_dir, output_json, output_md, action_queue_path, studio_queue_path, writing_status_path = sys.argv[1:8]
    sanity = load_json(sanity_path)
    os.makedirs(output_dir, exist_ok=True)
    artifacts_by_id = {item.get("artifactId"): item for item in sanity.get("artifacts", [])}
    podcast = artifacts_by_id.get(AUDIO_ID) or {}
    target_duration = as_float(podcast.get("longestAudioStreamSeconds")) or as_float(podcast.get("durationSecondsFromFfprobe")) or as_float(podcast.get("durationSecondsFromProof"))
    if not target_duration:
        raise SystemExit("Could not determine target program audio duration.")

    generated: list[dict[str, Any]] = []
    source_video_duration = None
    for artifact_id in ("episode-16x9-master", "episode-9x16-master"):
        artifact = artifacts_by_id.get(artifact_id) or {}
        source_path = artifact.get("path")
        if not source_path or not os.path.exists(source_path):
            generated.append(
                {
                    "artifactId": artifact_id,
                    "sourcePath": source_path,
                    "outputPath": None,
                    "exists": False,
                    "exitCode": None,
                    "error": "source missing",
                }
            )
            continue
        source_video_duration = source_video_duration or as_float(artifact.get("longestVideoStreamSeconds")) or as_float(artifact.get("durationSecondsFromFfprobe"))
        output_path = os.path.join(output_dir, safe_basename(source_path, "-tail-trim-candidate"))
        item = trim_video(source_path, output_path, target_duration)
        item["artifactId"] = artifact_id
        item["trimmedTailSeconds"] = (as_float(artifact.get("longestVideoStreamSeconds")) or 0) - target_duration
        generated.append(item)

    audio_source = podcast.get("path")
    if audio_source and os.path.exists(audio_source):
        output_path = os.path.join(output_dir, safe_basename(audio_source, "-candidate-copy"))
        item = copy_audio(audio_source, output_path)
        item["artifactId"] = AUDIO_ID
        generated.append(item)

    for item in generated:
        if item.get("exists"):
            item["candidateEndingSample"] = create_candidate_ending_sample(item, output_dir)

    failed = [item for item in generated if item.get("exitCode") != 0 or not item.get("exists")]
    failed_samples = [
        item
        for item in generated
        if item.get("exists")
        and (
            not (item.get("candidateEndingSample") or {}).get("exists")
            or (item.get("candidateEndingSample") or {}).get("exitCode") != 0
        )
    ]
    packet = {
        "packetType": "quipsly-episode1-tail-trim-candidate",
        "version": "2026-06-20.tail-trim-candidate.v1",
        "projectSlug": sanity.get("projectSlug", "high-ground-odyssey-manuscript"),
        "episodeSlug": sanity.get("episodeSlug", "episode-1"),
        "generatedAt": now_iso(),
        "sourceSanityPacket": sanity_path,
        "outputDir": output_dir,
        "reviewSampleDir": os.path.join(output_dir, "review-samples"),
        "writtenTo": output_json,
        "markdown": output_md,
        "status": "tail-trim-candidate-generated-needs-review" if not failed else "tail-trim-candidate-generation-failed",
        "targetDurationSeconds": target_duration,
        "sourceVideoDurationSeconds": source_video_duration,
        "trimmedTailSeconds": (source_video_duration - target_duration) if source_video_duration else None,
        "failedArtifactCount": len(failed),
        "failedCandidateSampleCount": len(failed_samples),
        "artifacts": generated,
        "truth": "This creates non-destructive replacement candidates for review. It does not overwrite originals, approve artifacts, publish, upload, schedule, or capture receipts.",
    }
    write_json(output_json, packet)
    with open(output_md, "w", encoding="utf-8") as handle:
        handle.write(markdown(packet))
        handle.write("\n")

    for path in (action_queue_path, studio_queue_path, writing_status_path):
        payload = load_json(path)
        payload["updatedAt"] = packet["generatedAt"]
        if path == action_queue_path:
            payload["currentTailTrimCandidate"] = output_json
            payload["currentTailTrimCandidateMarkdown"] = output_md
            payload.setdefault("operatorCommands", {})["generateTailTrimCandidate"] = "script/agentctl.sh episode1-tail-trim-candidate"
        elif path == studio_queue_path:
            payload["currentTailTrimCandidate"] = output_json
            payload["currentTailTrimCandidateMarkdown"] = output_md
            payload.setdefault("operatorCommands", {})["generateTailTrimCandidate"] = "script/agentctl.sh episode1-tail-trim-candidate"
        else:
            payload.setdefault("authoritativeArtifacts", {})["tailTrimCandidate"] = output_json
            payload.setdefault("authoritativeArtifacts", {})["tailTrimCandidateMarkdown"] = output_md
            payload.setdefault("operatorCommands", {})["generateTailTrimCandidate"] = "script/agentctl.sh episode1-tail-trim-candidate"
        write_json(path, payload)

    print(
        json.dumps(
            {
                "packetType": "quipsly-tail-trim-candidate-result",
                "status": packet["status"],
                "writtenTo": output_json,
                "markdown": output_md,
                "outputDir": output_dir,
                "failedArtifactCount": len(failed),
                "failedCandidateSampleCount": len(failed_samples),
                "truth": packet["truth"],
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
