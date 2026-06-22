#!/usr/bin/env python3
"""Episode 1 artifact machine sanity review.

This is pre-review evidence, not publication approval.
It checks exported artifact metadata and short audio samples so humans and agents
can spend attention on the parts that still need judgment.
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


def run(args: list[str], timeout: int = 60) -> dict[str, Any]:
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
            "stdout": result.stdout[:20000],
            "stderr": result.stderr[:20000],
            "timedOut": False,
        }
    except subprocess.TimeoutExpired as error:
        return {
            "command": args,
            "exitCode": None,
            "stdout": (error.stdout or "")[:20000],
            "stderr": (error.stderr or "")[:20000],
            "timedOut": True,
        }
    except Exception as error:  # pragma: no cover - operator machine state
        return {
            "command": args,
            "exitCode": None,
            "stdout": "",
            "stderr": str(error),
            "timedOut": False,
        }


def ffprobe(path: str) -> dict[str, Any]:
    result = run(
        [
            "/opt/homebrew/bin/ffprobe",
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            path,
        ],
        timeout=45,
    )
    if result["exitCode"] != 0:
        fallback = run(
            [
                "/usr/local/bin/ffprobe",
                "-v",
                "error",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                path,
            ],
            timeout=45,
        )
        if fallback["exitCode"] == 0:
            result = fallback
    if result["exitCode"] != 0:
        fallback = run(
            [
                "ffprobe",
                "-v",
                "error",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                path,
            ],
            timeout=45,
        )
        if fallback["exitCode"] == 0:
            result = fallback
    payload: dict[str, Any] = {"raw": result}
    if result["exitCode"] == 0 and result["stdout"].strip():
        try:
            payload["json"] = json.loads(result["stdout"])
        except json.JSONDecodeError as error:
            payload["parseError"] = str(error)
    return payload


def ffmpeg_binary() -> str:
    for candidate in ("/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "ffmpeg"):
        result = run([candidate, "-version"], timeout=10)
        if result["exitCode"] == 0:
            return candidate
    return "ffmpeg"


def audio_sample_checks(path: str, duration: float | None) -> list[dict[str, Any]]:
    if not duration or duration <= 0:
        return []

    ffmpeg = ffmpeg_binary()
    starts = [0.0]
    if duration > 180:
        starts.append(max(0.0, duration / 2.0 - 7.5))
    if duration > 60:
        starts.append(max(0.0, duration - 20.0))

    checks: list[dict[str, Any]] = []
    for start in starts:
        result = run(
            [
                ffmpeg,
                "-hide_banner",
                "-nostats",
                "-ss",
                f"{start:.3f}",
                "-t",
                "12",
                "-i",
                path,
                "-vn",
                "-af",
                "volumedetect",
                "-f",
                "null",
                "-",
            ],
            timeout=45,
        )
        stderr = result.get("stderr") or ""
        mean_volume = None
        max_volume = None
        for line in stderr.splitlines():
            line = line.strip()
            if "mean_volume:" in line:
                mean_volume = line.split("mean_volume:", 1)[1].strip()
            if "max_volume:" in line:
                max_volume = line.split("max_volume:", 1)[1].strip()
        checks.append(
            {
                "startSeconds": round(start, 3),
                "durationSeconds": 12,
                "exitCode": result["exitCode"],
                "timedOut": result["timedOut"],
                "meanVolume": mean_volume,
                "maxVolume": max_volume,
                "stderrTail": "\n".join(stderr.splitlines()[-20:]),
            }
        )
    return checks


def as_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def stream_summary(probe_json: dict[str, Any]) -> list[dict[str, Any]]:
    streams = probe_json.get("streams") or []
    summary = []
    for stream in streams:
        summary.append(
            {
                "index": stream.get("index"),
                "codecType": stream.get("codec_type"),
                "codecName": stream.get("codec_name"),
                "width": stream.get("width"),
                "height": stream.get("height"),
                "duration": stream.get("duration"),
                "sampleRate": stream.get("sample_rate"),
                "channels": stream.get("channels"),
                "rFrameRate": stream.get("r_frame_rate"),
                "avgFrameRate": stream.get("avg_frame_rate"),
            }
        )
    return summary


def artifact_sanity(item: dict[str, Any]) -> dict[str, Any]:
    artifact_id = item.get("artifactId")
    path = item.get("path") or ""
    exists = os.path.exists(path)
    proof_duration = as_float(item.get("durationSeconds"))
    result: dict[str, Any] = {
        "artifactId": artifact_id,
        "path": path,
        "exists": exists,
        "durationSecondsFromProof": proof_duration,
        "findings": [],
        "warnings": [],
        "blockingIssues": [],
        "truth": "Machine sanity checks catch obvious metadata/audio problems. They do not approve creative quality, pacing, full playback, or publication readiness.",
    }
    if not exists:
        result["blockingIssues"].append("Artifact file is missing.")
        return result

    probe = ffprobe(path)
    result["ffprobeExitCode"] = probe.get("raw", {}).get("exitCode")
    result["ffprobeTimedOut"] = probe.get("raw", {}).get("timedOut")
    probe_json = probe.get("json") or {}
    result["streams"] = stream_summary(probe_json)
    format_info = probe_json.get("format") or {}
    format_duration = as_float(format_info.get("duration"))
    result["durationSecondsFromFfprobe"] = format_duration
    result["containerFormat"] = format_info.get("format_name")
    result["formatBitRate"] = format_info.get("bit_rate")

    if probe.get("raw", {}).get("exitCode") != 0:
        result["blockingIssues"].append("ffprobe could not read the artifact.")
        result["ffprobeError"] = probe.get("raw", {}).get("stderr")
        return result

    if proof_duration and format_duration:
        drift = abs(proof_duration - format_duration)
        result["durationDriftSeconds"] = drift
        if drift <= 2.0:
            result["findings"].append("ffprobe duration roughly matches the proof duration.")
        else:
            result["warnings"].append(f"ffprobe duration differs from proof duration by {drift:.2f}s.")

    video_streams = [stream for stream in result["streams"] if stream.get("codecType") == "video"]
    audio_streams = [stream for stream in result["streams"] if stream.get("codecType") == "audio"]
    result["videoStreamCount"] = len(video_streams)
    result["audioStreamCount"] = len(audio_streams)
    video_durations = [as_float(stream.get("duration")) for stream in video_streams]
    audio_durations = [as_float(stream.get("duration")) for stream in audio_streams]
    video_durations = [duration for duration in video_durations if duration is not None]
    audio_durations = [duration for duration in audio_durations if duration is not None]
    result["longestVideoStreamSeconds"] = max(video_durations) if video_durations else None
    result["longestAudioStreamSeconds"] = max(audio_durations) if audio_durations else None
    if artifact_id in {"episode-16x9-master", "episode-9x16-master"} and video_durations and audio_durations:
        tail_gap = max(video_durations) - max(audio_durations)
        result["videoPastLongestAudioSeconds"] = tail_gap
        if tail_gap > 5:
            result["warnings"].append(
                f"Video stream runs {tail_gap:.2f}s longer than the longest audio stream; review the ending for intentional silence, padding, or export mismatch."
            )

    if artifact_id in {"episode-16x9-master", "episode-9x16-master"}:
        if video_streams:
            result["findings"].append("Video stream present.")
        else:
            result["blockingIssues"].append("Expected video stream is missing.")
        if audio_streams:
            result["findings"].append("Audio stream present in video master.")
        else:
            result["warnings"].append("No audio stream found in video master.")
    elif artifact_id == "podcast-audio-master":
        if audio_streams:
            result["findings"].append("Audio stream present in podcast master.")
        else:
            result["blockingIssues"].append("Expected audio stream is missing.")
        if video_streams:
            result["warnings"].append("Podcast audio master unexpectedly contains a video stream.")

    result["audioSampleChecks"] = audio_sample_checks(path, format_duration or proof_duration)
    good_samples = [
        check
        for check in result["audioSampleChecks"]
        if check.get("exitCode") == 0 and check.get("maxVolume") and check.get("maxVolume") != "-inf dB"
    ]
    weak_samples = [
        check
        for check in result["audioSampleChecks"]
        if check.get("exitCode") != 0 or not check.get("maxVolume") or check.get("maxVolume") == "-inf dB"
    ]
    if audio_streams and good_samples:
        result["findings"].append("Short audio samples decoded with non-infinite peak volume.")
    elif audio_streams:
        result["warnings"].append("Audio stream exists, but short sampled volume checks did not prove audible peaks.")
    if audio_streams and weak_samples:
        starts = ", ".join(f"{check.get('startSeconds')}s" for check in weak_samples)
        result["warnings"].append(f"One or more sampled audio windows did not prove audible peaks: {starts}.")

    return result


def markdown(packet: dict[str, Any]) -> str:
    lines = [
        "# Episode 1 artifact machine sanity review",
        "",
        f"Generated: {packet['generatedAt']}",
        "",
        f"Status: `{packet['status']}`",
        "",
        "This is automated pre-review evidence. It catches obvious container, duration, stream, and sampled-audio problems before a human or delegated agent spends full attention on watch/listen review.",
        "",
        f"Source proof review: `{packet['sourceProofReview']}`",
        f"JSON packet: `{packet['writtenTo']}`",
        "",
        "## Overall",
        "",
        f"- Blocking issues: `{packet['blockingIssueCount']}`",
        f"- Warnings: `{packet['warningCount']}`",
        "- Truth: this does not approve publication, pacing, editorial quality, selected shorts, or end-to-end audio.",
        "",
    ]
    for artifact in packet["artifacts"]:
        lines.extend(
            [
                f"## {artifact['artifactId']}",
                "",
                f"- Path: `{artifact['path']}`",
                f"- Exists: `{artifact['exists']}`",
                f"- ffprobe exit: `{artifact.get('ffprobeExitCode')}`",
                f"- Proof duration: `{artifact.get('durationSecondsFromProof')}`",
                f"- ffprobe duration: `{artifact.get('durationSecondsFromFfprobe')}`",
                f"- Video streams: `{artifact.get('videoStreamCount')}`",
                f"- Audio streams: `{artifact.get('audioStreamCount')}`",
                f"- Longest video stream: `{artifact.get('longestVideoStreamSeconds')}`",
                f"- Longest audio stream: `{artifact.get('longestAudioStreamSeconds')}`",
                f"- Video past longest audio: `{artifact.get('videoPastLongestAudioSeconds')}`",
                "",
                "Findings:",
                "",
            ]
        )
        for finding in artifact.get("findings") or ["No positive findings recorded."]:
            lines.append(f"- {finding}")
        lines.extend(["", "Warnings:", ""])
        for warning in artifact.get("warnings") or ["None."]:
            lines.append(f"- {warning}")
        lines.extend(["", "Blocking issues:", ""])
        for issue in artifact.get("blockingIssues") or ["None."]:
            lines.append(f"- {issue}")
        lines.extend(["", "Sampled audio checks:", ""])
        for check in artifact.get("audioSampleChecks") or []:
            lines.append(
                f"- start `{check.get('startSeconds')}`s, exit `{check.get('exitCode')}`, mean `{check.get('meanVolume')}`, max `{check.get('maxVolume')}`"
            )
        if not artifact.get("audioSampleChecks"):
            lines.append("- None.")
        lines.append("")
    lines.extend(
        [
            "## Next action",
            "",
            "Use this as pre-review support, then complete the real watch/listen worksheet:",
            "",
            "`/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-watch-listen-review.md`",
            "",
        ]
    )
    return "\n".join(lines) + "\n"


def main() -> int:
    if len(sys.argv) != 8:
        print(
            "usage: episode1_artifact_sanity_review.py proof.json output.json output.md action-queue.json studio-queue.json writing-status.json worklog.md",
            file=sys.stderr,
        )
        return 2

    proof_path, output_path, markdown_path, action_queue_path, studio_queue_path, writing_status_path, worklog_path = sys.argv[1:8]
    proof = load_json(proof_path)
    artifacts = [
        artifact_sanity(item)
        for item in proof.get("artifacts", [])
        if item.get("artifactId") in REVIEW_ARTIFACT_IDS
    ]
    blocking_issue_count = sum(len(item.get("blockingIssues") or []) for item in artifacts)
    warning_count = sum(len(item.get("warnings") or []) for item in artifacts)
    status = "machine-sanity-review-generated-needs-watch-listen-review"
    if blocking_issue_count:
        status = "machine-sanity-review-found-blocking-issues"
    elif warning_count:
        status = "machine-sanity-review-generated-with-warnings-needs-watch-listen-review"

    packet = {
        "packetType": "quipsly-artifact-machine-sanity-review",
        "version": "2026-06-20.artifact-machine-sanity-review.v1",
        "projectSlug": proof.get("projectSlug", "high-ground-odyssey-manuscript"),
        "episodeSlug": proof.get("episodeSlug", "episode-1"),
        "generatedAt": now_iso(),
        "sourceProofReview": proof_path,
        "writtenTo": output_path,
        "markdown": markdown_path,
        "status": status,
        "blockingIssueCount": blocking_issue_count,
        "warningCount": warning_count,
        "artifacts": artifacts,
        "truth": "This machine sanity review gathers ffprobe and sampled-audio evidence. It does not perform full watch/listen review, approve, publish, upload, schedule, or capture receipts.",
    }
    write_json(output_path, packet)
    os.makedirs(os.path.dirname(markdown_path) or ".", exist_ok=True)
    with open(markdown_path, "w", encoding="utf-8") as handle:
        handle.write(markdown(packet))

    for path in (action_queue_path, studio_queue_path, writing_status_path):
        payload = load_json(path)
        payload["updatedAt"] = packet["generatedAt"]
        if path == action_queue_path:
            payload["currentArtifactMachineSanityReview"] = output_path
            payload["currentArtifactMachineSanityReviewMarkdown"] = markdown_path
            payload.setdefault("operatorCommands", {})["generateArtifactMachineSanityReview"] = "script/agentctl.sh episode1-artifact-sanity-review"
        elif path == studio_queue_path:
            payload["currentArtifactMachineSanityReview"] = output_path
            payload["currentArtifactMachineSanityReviewMarkdown"] = markdown_path
            payload.setdefault("operatorCommands", {})["generateArtifactMachineSanityReview"] = "script/agentctl.sh episode1-artifact-sanity-review"
        else:
            payload.setdefault("authoritativeArtifacts", {})["artifactMachineSanityReview"] = output_path
            payload.setdefault("authoritativeArtifacts", {})["artifactMachineSanityReviewMarkdown"] = markdown_path
            payload.setdefault("operatorCommands", {})["generateArtifactMachineSanityReview"] = "script/agentctl.sh episode1-artifact-sanity-review"
        write_json(path, payload)

    with open(worklog_path, "a", encoding="utf-8") as handle:
        handle.write(
            "\n## 2026-06-20 - Episode 1 artifact machine sanity review\n\n"
            "Generated automated pre-review evidence for the full-length Episode 1 artifacts.\n\n"
            "Checked:\n\n"
            "- ffprobe container and stream metadata\n"
            "- proof-duration versus ffprobe-duration drift\n"
            "- expected video/audio stream presence\n"
            "- short sampled-audio volume checks near the start, middle, and end where possible\n\n"
            "Generated:\n\n"
            f"- `{output_path}`\n"
            f"- `{markdown_path}`\n\n"
            f"Result: `{status}` with `{blocking_issue_count}` blocking issues and `{warning_count}` warnings.\n\n"
            "Truth boundary: this is machine pre-review evidence, not full watch/listen review, artifact approval, upload, schedule, publication, or receipt capture.\n"
        )

    print(json.dumps({
        "packetType": "quipsly-artifact-machine-sanity-review-result",
        "status": status,
        "writtenTo": output_path,
        "markdown": markdown_path,
        "blockingIssueCount": blocking_issue_count,
        "warningCount": warning_count,
        "truth": packet["truth"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
