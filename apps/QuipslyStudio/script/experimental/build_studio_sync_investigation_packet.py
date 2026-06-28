#!/usr/bin/env python3
"""Build a non-mutating sync investigation packet for major duration spreads.

This is for cases like Episode 4 where long-form video and podcast audio differ
by many minutes. A trim candidate would be dishonest here; the safe move is to
show evidence at matched sequence offsets and at the extra tail so a human or
agent can decide whether the package needs re-sync, a new stack, or a held
review task.
"""
from __future__ import annotations

import argparse
import csv
import html
import json
import math
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SCHEMA = "quipsly.studio-sync-investigation.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def resolve_tool(name: str) -> str:
    found = shutil.which(name)
    if found:
        return found
    for candidate in (f"/opt/homebrew/bin/{name}", f"/usr/local/bin/{name}"):
        if Path(candidate).exists():
            return candidate
    raise SystemExit(f"{name} is required for sync investigation packets.")


def run(command: list[str], timeout: int = 180) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout, check=False)


def as_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def ffprobe(path: Path, ffprobe_bin: str) -> dict[str, Any]:
    if not path.exists():
        return {"error": "missing-file"}
    result = run([
        ffprobe_bin,
        "-v", "error",
        "-show_format",
        "-show_streams",
        "-of", "json",
        str(path),
    ], timeout=40)
    if result.returncode != 0:
        return {"error": (result.stderr or result.stdout or "ffprobe failed").strip()}
    try:
        return json.loads(result.stdout or "{}")
    except json.JSONDecodeError:
        return {"error": "ffprobe returned non-json output"}


def duration_from_probe(probe: dict[str, Any]) -> float | None:
    duration = as_float((probe.get("format") or {}).get("duration"))
    if duration is not None:
        return duration
    stream_durations = [as_float(stream.get("duration")) for stream in probe.get("streams") or []]
    stream_durations = [value for value in stream_durations if value is not None]
    return max(stream_durations) if stream_durations else None


def stream_summary(probe: dict[str, Any]) -> dict[str, Any]:
    streams = probe.get("streams") or []
    video = [item for item in streams if item.get("codec_type") == "video"]
    audio = [item for item in streams if item.get("codec_type") == "audio"]
    return {
        "durationSeconds": duration_from_probe(probe),
        "videoStreams": len(video),
        "audioStreams": len(audio),
        "video": [
            {
                "codec": item.get("codec_name"),
                "width": item.get("width"),
                "height": item.get("height"),
                "durationSeconds": as_float(item.get("duration")),
            }
            for item in video
        ],
        "audio": [
            {
                "codec": item.get("codec_name"),
                "sampleRate": item.get("sample_rate"),
                "channels": item.get("channels"),
                "durationSeconds": as_float(item.get("duration")),
            }
            for item in audio
        ],
        "error": probe.get("error") or "",
    }


def format_duration(seconds: float | None) -> str:
    if seconds is None:
        return "unknown"
    seconds = max(0.0, float(seconds))
    whole = int(seconds)
    ms = int(round((seconds - whole) * 1000))
    h, rem = divmod(whole, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}.{ms:03d}"
    return f"{m}:{s:02d}.{ms:03d}"


def safe_key(value: str) -> str:
    return "".join(ch if ch.isalnum() else "-" for ch in value).strip("-").lower() or "item"


def artifact_path(item: dict[str, Any]) -> Path:
    return Path(str(item.get("path") or item.get("outputPath") or ""))


def collect_manifest_artifacts(manifest: dict[str, Any], ffprobe_bin: str) -> list[dict[str, Any]]:
    raw = manifest.get("artifacts") if isinstance(manifest.get("artifacts"), dict) else {}
    labels = {
        "videoMaster16x9": "16:9 video master",
        "videoMaster9x16": "9:16 video master",
        "audioOnlyPodcast": "podcast audio master",
    }
    artifacts: list[dict[str, Any]] = []
    for key in ["videoMaster16x9", "videoMaster9x16", "audioOnlyPodcast"]:
        item = raw.get(key)
        if not isinstance(item, dict):
            continue
        path = artifact_path(item)
        probe = ffprobe(path, ffprobe_bin)
        summary = stream_summary(probe)
        artifacts.append({
            "key": key,
            "label": labels.get(key, key),
            "path": str(path),
            "exists": path.exists(),
            "sizeBytes": path.stat().st_size if path.exists() else 0,
            "manifestDurationSeconds": item.get("durationSeconds"),
            "summary": summary,
        })
    return artifacts


def choose_latest_major_workorder(release_root: Path, episode: int | None = None) -> dict[str, Any]:
    pointer = load_json(release_root / "review-board" / "latest-duration-repair-workorders.json")
    workorder_path = Path(str(pointer.get("jsonPath") or ""))
    packet = load_json(workorder_path)
    workorders = packet.get("workorders") if isinstance(packet.get("workorders"), list) else []
    candidates: list[dict[str, Any]] = []
    for order in workorders:
        if not isinstance(order, dict):
            continue
        try:
            order_episode = int(order.get("episode") or 0)
        except (TypeError, ValueError):
            order_episode = 0
        if episode and order_episode != episode:
            continue
        spread = as_float(order.get("spreadSeconds")) or 0.0
        if order.get("severity") == "major-human-review" or spread >= 600:
            candidates.append(order)
    if not candidates and episode:
        manifest_path = release_root / f"Episode_{episode:02d}" / "v001" / "manifest.json"
        if manifest_path.exists():
            return {
                "episode": episode,
                "currentVersion": manifest_path.parent.name,
                "manifestPath": str(manifest_path),
                "spreadSeconds": None,
                "spreadLabel": "unknown",
                "severity": "manual-sync-investigation",
                "status": "manifest-selected",
                "warnings": load_json(manifest_path).get("warnings") or [],
            }
    if not candidates:
        raise SystemExit("No major duration-spread sync investigation target found. Run studio-duration-repair-workorders first or pass an episode number with a manifest.")
    return sorted(candidates, key=lambda item: float(as_float(item.get("spreadSeconds")) or 0.0), reverse=True)[0]


def resolve_target(arg: str, release_root: Path) -> dict[str, Any]:
    if arg in {"", "latest", "major"}:
        return choose_latest_major_workorder(release_root)
    try:
        episode = int(arg)
        return choose_latest_major_workorder(release_root, episode=episode)
    except ValueError:
        pass
    path = Path(arg).expanduser()
    if path.is_dir():
        path = path / "manifest.json"
    if not path.exists():
        raise SystemExit(f"Sync investigation manifest not found: {path}")
    manifest = load_json(path)
    return {
        "episode": int(manifest.get("episode") or 0),
        "currentVersion": path.parent.name,
        "manifestPath": str(path),
        "spreadSeconds": None,
        "spreadLabel": "unknown",
        "severity": "manual-sync-investigation",
        "status": "manifest-selected",
        "warnings": manifest.get("warnings") or [],
    }


def make_probe_points(video_duration: float, audio_duration: float, snippet_seconds: float) -> list[dict[str, Any]]:
    snippet_seconds = max(5.0, min(float(snippet_seconds), 20.0))
    video_duration = max(0.1, video_duration)
    audio_duration = max(0.1, audio_duration)
    shared_duration = min(video_duration, audio_duration)
    points = [
        {
            "id": "shared-beginning",
            "label": "Shared beginning",
            "reason": "Do the video master and podcast audio start together?",
            "sequenceSeconds": 0.0,
            "videoStartSeconds": 0.0,
            "audioStartSeconds": 0.0,
            "durationSeconds": snippet_seconds,
        },
        {
            "id": "shared-middle",
            "label": "Shared middle",
            "reason": "Do the artifacts remain aligned halfway through the shared duration?",
            "sequenceSeconds": max(0.0, shared_duration / 2.0),
            "videoStartSeconds": max(0.0, shared_duration / 2.0),
            "audioStartSeconds": max(0.0, shared_duration / 2.0),
            "durationSeconds": snippet_seconds,
        },
        {
            "id": "video-ending",
            "label": "Video ending",
            "reason": "Does the video end naturally, and what audio is heard at the same sequence time?",
            "sequenceSeconds": max(0.0, video_duration - snippet_seconds),
            "videoStartSeconds": max(0.0, video_duration - snippet_seconds),
            "audioStartSeconds": max(0.0, min(audio_duration - snippet_seconds, video_duration - snippet_seconds)),
            "durationSeconds": snippet_seconds,
        },
    ]
    if audio_duration > video_duration + 1.0:
        points.extend([
            {
                "id": "audio-extra-start",
                "label": "Audio extra starts after video",
                "reason": "Podcast audio continues after the long-form video ends; inspect what begins there.",
                "sequenceSeconds": video_duration,
                "videoStartSeconds": None,
                "audioStartSeconds": max(0.0, min(audio_duration - snippet_seconds, video_duration)),
                "durationSeconds": snippet_seconds,
            },
            {
                "id": "audio-ending",
                "label": "Audio ending",
                "reason": "Inspect the audio-only tail before any trim or re-stack decision.",
                "sequenceSeconds": audio_duration,
                "videoStartSeconds": None,
                "audioStartSeconds": max(0.0, audio_duration - snippet_seconds),
                "durationSeconds": snippet_seconds,
            },
        ])
    elif video_duration > audio_duration + 1.0:
        points.extend([
            {
                "id": "video-extra-start",
                "label": "Video extra starts after audio",
                "reason": "Video continues after podcast audio ends; inspect what begins there.",
                "sequenceSeconds": audio_duration,
                "videoStartSeconds": max(0.0, min(video_duration - snippet_seconds, audio_duration)),
                "audioStartSeconds": None,
                "durationSeconds": snippet_seconds,
            },
            {
                "id": "video-ending-extra",
                "label": "Video ending extra",
                "reason": "Inspect the video-only tail before any trim or re-stack decision.",
                "sequenceSeconds": video_duration,
                "videoStartSeconds": max(0.0, video_duration - snippet_seconds),
                "audioStartSeconds": None,
                "durationSeconds": snippet_seconds,
            },
        ])
    return points


def make_snippet(source: Path, output: Path, start: float, duration: float, has_video: bool, ffmpeg_bin: str) -> dict[str, Any]:
    output.parent.mkdir(parents=True, exist_ok=True)
    if has_video:
        command = [
            ffmpeg_bin,
            "-hide_banner",
            "-n",
            "-ss", f"{start:.3f}",
            "-t", f"{duration:.3f}",
            "-i", str(source),
            "-vf", "scale='min(960,iw)':-2",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "25",
            "-c:a", "aac",
            "-b:a", "128k",
            str(output),
        ]
    else:
        command = [
            ffmpeg_bin,
            "-hide_banner",
            "-n",
            "-ss", f"{start:.3f}",
            "-t", f"{duration:.3f}",
            "-i", str(source),
            "-vn",
            "-c:a", "aac",
            "-b:a", "128k",
            str(output),
        ]
    result = run(command, timeout=180)
    return {
        "outputPath": str(output),
        "command": " ".join(shell_quote(part) for part in command),
        "returnCode": result.returncode,
        "ok": result.returncode == 0 or output.exists(),
        "stderrTail": (result.stderr or "")[-1200:],
    }


def find_artifact(artifacts: list[dict[str, Any]], key: str) -> dict[str, Any] | None:
    return next((item for item in artifacts if item.get("key") == key), None)


def comparison_review_prompt(point_id: str) -> dict[str, str]:
    prompts = {
        "shared-beginning": {
            "question": "Do the video-master audio and podcast-audio start on the same moment of the conversation?",
            "passSignal": "Same words, room tone, or opening moment within a second or two.",
            "concernSignal": "Different words, missing intro, repeated setup, or obvious offset right at the start.",
        },
        "shared-middle": {
            "question": "Halfway through the shared duration, are the video and podcast audio still describing the same moment?",
            "passSignal": "Same topic and same sentence neighborhood in both snippets.",
            "concernSignal": "Podcast audio is ahead/behind, or the snippets are from different conversation sections.",
        },
        "video-ending": {
            "question": "At the video ending, does the video conclude naturally and does the podcast audio match that ending?",
            "passSignal": "Both sound like the same closing beat, or the video ending is a clearly intentional stop.",
            "concernSignal": "Podcast audio is mid-conversation when video ends, or the video cuts off before a real ending.",
        },
        "audio-extra-start": {
            "question": "When podcast audio continues after the video master ends, what kind of audio is it?",
            "passSignal": "It is silence, dead air, duplicate tail, or clearly non-publishable material.",
            "concernSignal": "It is real episode conversation that has no matching video in the current master.",
        },
        "audio-ending": {
            "question": "At the very end of the podcast-audio tail, does it sound like valid episode content or expendable tail?",
            "passSignal": "Expendable tail: silence, post-call cleanup, duplicate audio, or not part of the episode.",
            "concernSignal": "Valid episode ending, important conversation, or material that should exist in the video edit.",
        },
        "video-extra-start": {
            "question": "When video continues after podcast audio ends, is the extra video valid episode content?",
            "passSignal": "Extra video is dead air, setup/cleanup, duplicate, or non-publishable.",
            "concernSignal": "Video contains real conversation that should have audio.",
        },
        "video-ending-extra": {
            "question": "At the end of the video-only tail, does it look like real episode content or expendable tail?",
            "passSignal": "Expendable tail or intentional visual-only ending.",
            "concernSignal": "Important video moment with missing podcast audio.",
        },
    }
    return prompts.get(point_id, {
        "question": "Do these snippets describe the same intended sequence moment?",
        "passSignal": "The snippets align well enough to continue review.",
        "concernSignal": "The snippets imply offset, missing media, duplicate content, or wrong artifact routing.",
    })


def build_review_worksheet(packet: dict[str, Any], dry_run_review_commands: dict[str, str]) -> dict[str, Any]:
    checklist: list[dict[str, Any]] = []
    for comparison in packet.get("comparisons") or []:
        prompt = comparison_review_prompt(str(comparison.get("id") or ""))
        checklist.append({
            "id": comparison.get("id"),
            "label": comparison.get("label"),
            "sequenceSeconds": comparison.get("sequenceSeconds"),
            "videoStartSeconds": comparison.get("videoStartSeconds"),
            "audioStartSeconds": comparison.get("audioStartSeconds"),
            "question": prompt["question"],
            "passSignal": prompt["passSignal"],
            "concernSignal": prompt["concernSignal"],
            "videoSnippet": (comparison.get("videoSnippet") or {}).get("outputPath") or "",
            "audioSnippet": (comparison.get("audioSnippet") or {}).get("outputPath") or "",
        })
    return {
        "reviewerMode": "watch-listen-compare-before-any-ledger-write",
        "defaultDecision": "hold-current-package-for-sync-review",
        "plainEnglish": (
            "Use the snippets to decide whether the current package is merely tail-heavy, genuinely out of sync, "
            "missing source video/audio, or ready for a targeted versioned rebuild. Do not publish or approve from duration alone."
        ),
        "checklist": checklist,
        "outcomeOptions": [
            {
                "id": "hold-and-restack",
                "label": "Hold current package and request re-stack",
                "chooseWhen": "Beginning/middle/end snippets drift, or the extra tail appears to be real episode content not represented in the video master.",
                "dryRunCommands": [
                    dry_run_review_commands.get("holdCurrent16x9ForResync", ""),
                    dry_run_review_commands.get("holdCurrent9x16ForResync", ""),
                    dry_run_review_commands.get("holdCurrentPodcastAudioForResync", ""),
                    dry_run_review_commands.get("requestRestack16x9", ""),
                    dry_run_review_commands.get("requestRestackPodcastAudio", ""),
                ],
            },
            {
                "id": "audio-tail-trim-candidate",
                "label": "Prepare an audio-tail trim candidate",
                "chooseWhen": "Shared beginning/middle/video-ending align, and the audio-only tail is clearly dead air, duplicate, cleanup, or non-episode material.",
                "dryRunCommands": [
                    dry_run_review_commands.get("requestRestackPodcastAudio", ""),
                ],
            },
            {
                "id": "source-media-needed",
                "label": "Mark missing/source-media-needed",
                "chooseWhen": "The extra audio or video looks like valid episode content that should exist in the final package but is absent from the paired artifact.",
                "dryRunCommands": [
                    dry_run_review_commands.get("holdCurrent16x9ForResync", ""),
                    dry_run_review_commands.get("holdCurrent9x16ForResync", ""),
                    dry_run_review_commands.get("holdCurrentPodcastAudioForResync", ""),
                ],
            },
            {
                "id": "approve-after-human-review",
                "label": "Continue toward approval",
                "chooseWhen": "All comparison points align and any duration difference is explained and acceptable.",
                "dryRunCommands": [],
                "warning": "This packet does not approve anything. Use the Tower review ledger only after a full watch/listen review.",
            },
        ],
    }


def build_packet(target: dict[str, Any], release_root: Path, snippet_seconds: float) -> dict[str, Any]:
    ffmpeg_bin = resolve_tool("ffmpeg")
    ffprobe_bin = resolve_tool("ffprobe")
    manifest_path = Path(str(target.get("manifestPath") or ""))
    manifest = load_json(manifest_path)
    if not manifest:
        raise SystemExit(f"Could not read sync investigation manifest: {manifest_path}")

    episode = int(target.get("episode") or manifest.get("episode") or 0)
    version = str(target.get("currentVersion") or manifest_path.parent.name)
    session_dir = release_root / "review-board" / "sync-investigations" / f"{stamp()}-episode-{episode:02d}-{version}-sync-investigation"
    snippets_dir = session_dir / "snippets"
    session_dir.mkdir(parents=True, exist_ok=False)

    artifacts = collect_manifest_artifacts(manifest, ffprobe_bin)
    video = find_artifact(artifacts, "videoMaster16x9") or find_artifact(artifacts, "videoMaster9x16")
    audio = find_artifact(artifacts, "audioOnlyPodcast")
    if not video or not audio:
        raise SystemExit("Sync investigation requires at least one video master and one podcast audio artifact.")
    video_duration = as_float((video.get("summary") or {}).get("durationSeconds")) or 0.0
    audio_duration = as_float((audio.get("summary") or {}).get("durationSeconds")) or 0.0
    points = make_probe_points(video_duration, audio_duration, snippet_seconds)

    comparisons: list[dict[str, Any]] = []
    for point in points:
        comparison: dict[str, Any] = dict(point)
        video_start = point.get("videoStartSeconds")
        audio_start = point.get("audioStartSeconds")
        if video_start is not None:
            source = Path(str(video.get("path") or ""))
            output = snippets_dir / f"{safe_key(point['id'])}-video.mp4"
            comparison["videoSnippet"] = make_snippet(source, output, float(video_start), float(point["durationSeconds"]), True, ffmpeg_bin) if source.exists() else {"ok": False, "outputPath": str(output), "stderrTail": "video source missing"}
        else:
            comparison["videoSnippet"] = {
                "ok": False,
                "outputPath": "",
                "reason": "No video exists at this extra-audio sequence point.",
            }
        if audio_start is not None:
            source = Path(str(audio.get("path") or ""))
            output = snippets_dir / f"{safe_key(point['id'])}-podcast-audio.m4a"
            comparison["audioSnippet"] = make_snippet(source, output, float(audio_start), float(point["durationSeconds"]), False, ffmpeg_bin) if source.exists() else {"ok": False, "outputPath": str(output), "stderrTail": "audio source missing"}
        else:
            comparison["audioSnippet"] = {
                "ok": False,
                "outputPath": "",
                "reason": "No podcast audio exists at this extra-video sequence point.",
            }
        comparisons.append(comparison)

    snippet_errors = [
        snippet
        for comparison in comparisons
        for snippet in [comparison.get("videoSnippet"), comparison.get("audioSnippet")]
        if isinstance(snippet, dict) and snippet.get("outputPath") and not snippet.get("ok")
    ]
    duration_spread = abs(audio_duration - video_duration) if video_duration and audio_duration else as_float(target.get("spreadSeconds"))
    duration_gap = float(duration_spread or 0.0)
    longer_artifact_kind = (
        "podcast-audio"
        if audio_duration > video_duration
        else "video-master"
        if video_duration > audio_duration
        else "matched"
    )
    plain_summary = (
        f"Podcast audio is {format_duration(duration_gap)} longer than the video masters. "
        "That usually means the package needs re-sync/re-stack review before publication, not a blind trim."
        if longer_artifact_kind == "podcast-audio" and duration_gap > 1
        else f"Video masters are {format_duration(duration_gap)} longer than the podcast audio. "
        "That usually means the package needs re-sync/re-stack review before publication, not a blind trim."
        if longer_artifact_kind == "video-master" and duration_gap > 1
        else "Video and podcast-audio durations are close; inspect snippets before choosing repair or approval."
    )
    status = "sync-investigation-ready" if not snippet_errors else "sync-investigation-has-errors"
    review_commands = {
        "holdCurrent16x9ForResync": f"./script/agentctl.sh tower-review-decision {episode} longForm16x9 hold '<reviewer>' '<{version} sync investigation indicates re-sync/re-stack needed; do not publish current 16:9 artifact>'",
        "holdCurrent9x16ForResync": f"./script/agentctl.sh tower-review-decision {episode} longForm9x16 hold '<reviewer>' '<{version} sync investigation indicates re-sync/re-stack needed; do not publish current 9:16 artifact>'",
        "holdCurrentPodcastAudioForResync": f"./script/agentctl.sh tower-review-decision {episode} podcastAudio hold '<reviewer>' '<{version} sync investigation indicates video/audio stack mismatch; do not publish current podcast audio with this package>'",
        "requestRestack16x9": f"./script/agentctl.sh tower-review-decision {episode} longForm16x9 refine '<reviewer>' '<{version} sync investigation suggests rebuilding stacked timeline from source/proxies before review>'",
        "requestRestackPodcastAudio": f"./script/agentctl.sh tower-review-decision {episode} podcastAudio refine '<reviewer>' '<{version} podcast audio appears materially longer than video masters; inspect spine/takes and rebuild before review>'",
    }
    dry_run_review_commands = {
        label: command.replace("./script/agentctl.sh tower-review-decision ", "./script/agentctl.sh tower-review-decision-dry-run ", 1)
        for label, command in review_commands.items()
    }
    source_tasks = [
        {
            "id": "confirm-current-package-artifacts",
            "label": "Confirm current package artifacts",
            "humanAsk": "Open the 16:9, 9:16, and podcast-audio artifacts and confirm they are all from the same intended Episode 4 export attempt.",
            "agentSafeWork": "Keep listing artifact paths, durations, snippets, and warnings. Do not trim, replace, promote, publish, or mutate any artifact.",
            "doneWhen": "Reviewer can say whether these three artifacts belong together or whether one came from the wrong source/take/export.",
        },
        {
            "id": "classify-audio-tail",
            "label": "Classify the podcast-audio tail",
            "humanAsk": "Listen to the audio-only tail snippets and decide whether the extra 33:43.776 is dead air/cleanup/duplicate material, or real episode content missing from the video masters.",
            "agentSafeWork": "Prepare more tail snippets or a tail transcript packet if needed. Do not create a trim candidate until the tail is classified.",
            "doneWhen": "Tail is classified as expendable, missing-video-content, wrong-audio-source, or needs-more-evidence.",
        },
        {
            "id": "decide-rebuild-path",
            "label": "Choose hold/re-stack/trim-candidate path",
            "humanAsk": "After comparing beginning, middle, video ending, and audio tail, choose one path: hold for re-stack, create a versioned trim candidate, or continue normal review.",
            "agentSafeWork": "Use dry-run Tower review commands to preview hold/refine decisions only. Real ledger updates require explicit reviewer judgment.",
            "doneWhen": "Episode 4 has an explicit local review decision path and no one is guessing from duration alone.",
        },
    ]
    human_ask = (
        f"Review Episode {episode} {version} sync evidence. The podcast audio is {format_duration(duration_gap)} longer than the video masters; "
        "decide whether this is missing video/source, wrong audio, expendable tail, or a required re-stack."
        if duration_gap > 1
        else f"Review Episode {episode} {version} sync evidence and confirm the package can proceed to normal watch/listen review."
    )
    agent_safe_parallel_work = (
        "Generate clearer snippet, duration, transcript, and source-evidence packets; preview Tower hold/refine commands with dry-run only. "
        "Do not trim, rebuild, promote, approve, publish, upload, schedule, capture receipts, overwrite versions, or mutate originals without explicit approval."
    )
    packet = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "releaseRoot": str(release_root),
        "sessionDir": str(session_dir),
        "jsonPath": str(session_dir / "sync-investigation.json"),
        "htmlPath": str(session_dir / "index.html"),
        "markdownPath": str(session_dir / "START-HERE-sync-investigation.md"),
        "worksheetPath": str(session_dir / "SYNC-REVIEW-WORKSHEET.md"),
        "csvPath": str(session_dir / "sync-investigation.csv"),
        "episode": episode,
        "version": version,
        "status": status,
        "severity": target.get("severity") or "major-human-review",
        "manifestPath": str(manifest_path),
        "durationSpreadSeconds": round(float(duration_spread or 0.0), 3),
        "durationGapSeconds": round(duration_gap, 3),
        "longerArtifactKind": longer_artifact_kind,
        "videoDurationSeconds": round(video_duration, 3),
        "audioDurationSeconds": round(audio_duration, 3),
        "videoDurationLabel": format_duration(video_duration),
        "audioDurationLabel": format_duration(audio_duration),
        "spreadLabel": format_duration(duration_spread),
        "plainEnglishDurationSummary": plain_summary,
        "warnings": target.get("warnings") or manifest.get("warnings") or [],
        "truth": "Sync investigation only. This uses derived release artifacts to create local evidence; it does not repair, approve, publish, upload, schedule, overwrite, delete, create receipts, or mutate original source media.",
        "diagnosis": plain_summary,
        "humanAsk": human_ask,
        "agentSafeParallelWork": agent_safe_parallel_work,
        "primaryLabel": f"Open Episode {episode} {version} sync investigation",
        "primaryPath": str(session_dir / "index.html"),
        "primaryCommand": f"open {shell_quote(str(session_dir / 'index.html'))}",
        "sourceTasks": source_tasks,
        "unblocksWhen": "Episode 4 can move forward when the reviewer has classified the audio/video mismatch and chosen hold/re-stack, versioned trim candidate, or normal review from snippet evidence.",
        "nextSafestAction": "Open this sync investigation packet, compare video and podcast-audio snippets at shared beginning/middle/video-ending and extra-tail points, then decide whether Episode 4 needs re-sync/re-stack, hold, or a versioned rebuild.",
        "firstSafeAction": {
            "label": f"Open Episode {episode} {version} sync investigation",
            "command": f"open {shell_quote(str(session_dir / 'index.html'))}",
            "path": str(session_dir / "index.html"),
            "safety": "Opens local sync evidence only. No publish/upload/schedule/receipt/account/source changes.",
        },
        "dryRunReviewCommands": dry_run_review_commands,
        "reviewCommands": review_commands,
        "counts": {
            "artifacts": len(artifacts),
            "comparisonPoints": len(comparisons),
            "snippets": sum(1 for comparison in comparisons for key in ["videoSnippet", "audioSnippet"] if (comparison.get(key) or {}).get("outputPath")),
            "snippetErrors": len(snippet_errors),
            "sourceFilesMutated": False,
            "originalMediaMutated": False,
            "versionsOverwritten": False,
            "externalPublishing": False,
            "receiptTruthCreated": False,
        },
        "artifacts": artifacts,
        "comparisons": comparisons,
    }
    packet["reviewWorksheet"] = build_review_worksheet(packet, dry_run_review_commands)
    return packet


def media_tag(path: str) -> str:
    escaped = html.escape(path)
    href = "file://" + escaped
    if path.lower().endswith(".mp4"):
        return f'<video controls preload="metadata" src="{href}"></video>'
    if path.lower().endswith(".m4a"):
        return f'<audio controls preload="metadata" src="{href}"></audio>'
    return f'<a href="{href}">{escaped}</a>'


def write_html(path: Path, packet: dict[str, Any]) -> None:
    worksheet = packet.get("reviewWorksheet") if isinstance(packet.get("reviewWorksheet"), dict) else {}
    checklist_rows = []
    for item in worksheet.get("checklist") or []:
        checklist_rows.append(f"""
          <article class="worksheet-card">
            <div class="eyebrow">{html.escape(str(item.get('id') or 'check'))}</div>
            <h3>{html.escape(str(item.get('label') or 'Review point'))}</h3>
            <p><strong>Question:</strong> {html.escape(str(item.get('question') or ''))}</p>
            <p><strong>Good sign:</strong> {html.escape(str(item.get('passSignal') or ''))}</p>
            <p><strong>Concern:</strong> {html.escape(str(item.get('concernSignal') or ''))}</p>
          </article>
        """)
    outcome_rows = []
    for outcome in worksheet.get("outcomeOptions") or []:
        commands = "".join(
            f"<pre>{html.escape(command)}</pre>"
            for command in outcome.get("dryRunCommands") or []
            if command
        )
        warning = f"<p class='warn'>{html.escape(str(outcome.get('warning') or ''))}</p>" if outcome.get("warning") else ""
        outcome_rows.append(f"""
          <article class="worksheet-card">
            <div class="eyebrow">{html.escape(str(outcome.get('id') or 'outcome'))}</div>
            <h3>{html.escape(str(outcome.get('label') or 'Outcome'))}</h3>
            <p>{html.escape(str(outcome.get('chooseWhen') or ''))}</p>
            {warning}
            {commands}
          </article>
        """)
    rows = []
    for comparison in packet.get("comparisons") or []:
        video_snippet = comparison.get("videoSnippet") if isinstance(comparison.get("videoSnippet"), dict) else {}
        audio_snippet = comparison.get("audioSnippet") if isinstance(comparison.get("audioSnippet"), dict) else {}
        rows.append(f"""
          <article class="comparison">
            <div class="eyebrow">{html.escape(str(comparison.get('id') or 'point'))}</div>
            <h2>{html.escape(str(comparison.get('label') or 'Comparison point'))}</h2>
            <p>{html.escape(str(comparison.get('reason') or ''))}</p>
            <p><strong>Sequence:</strong> {html.escape(format_duration(comparison.get('sequenceSeconds')))} · <strong>Video:</strong> {html.escape(format_duration(comparison.get('videoStartSeconds')))} · <strong>Audio:</strong> {html.escape(format_duration(comparison.get('audioStartSeconds')))}</p>
            <div class="grid">
              <div class="panel">
                <h3>Video master</h3>
                {media_tag(str(video_snippet.get('outputPath') or '')) if video_snippet.get('ok') else '<p class="warn">No video snippet at this point.</p>'}
              </div>
              <div class="panel">
                <h3>Podcast audio</h3>
                {media_tag(str(audio_snippet.get('outputPath') or '')) if audio_snippet.get('ok') else '<p class="warn">No podcast-audio snippet at this point.</p>'}
              </div>
            </div>
          </article>
        """)
    dry_run_commands = "".join(
        f"<li><strong>{html.escape(label)}</strong><pre>{html.escape(command)}</pre></li>"
        for label, command in (packet.get("dryRunReviewCommands") or {}).items()
    )
    commands = "".join(
        f"<li><strong>{html.escape(label)}</strong><pre>{html.escape(command)}</pre></li>"
        for label, command in (packet.get("reviewCommands") or {}).items()
    )
    source_task_rows = "".join(
        f"""
          <article class="worksheet-card">
            <div class="eyebrow">{html.escape(str(task.get('id') or 'task'))}</div>
            <h3>{html.escape(str(task.get('label') or 'Source task'))}</h3>
            <p><strong>Human ask:</strong> {html.escape(str(task.get('humanAsk') or ''))}</p>
            <p><strong>Agent-safe work:</strong> {html.escape(str(task.get('agentSafeWork') or ''))}</p>
            <p><strong>Done when:</strong> {html.escape(str(task.get('doneWhen') or ''))}</p>
          </article>
        """
        for task in packet.get("sourceTasks") or []
    )
    path.write_text(f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Episode {packet.get('episode')} sync investigation</title>
  <style>
    :root {{ color-scheme: dark; --bg:#101711; --panel:#1b271f; --ink:#fff3d8; --muted:#cabe9e; --gold:#edcb52; --moss:#8fbd72; --water:#73c7d7; --clay:#c8755d; --line:rgba(255,243,216,.15); }}
    body {{ margin:0; font-family:Avenir Next, Helvetica Neue, sans-serif; background:radial-gradient(circle at 14% 0%, rgba(143,189,114,.17), transparent 32%), var(--bg); color:var(--ink); }}
    header {{ padding:34px clamp(18px,5vw,72px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); letter-spacing:.19em; text-transform:uppercase; font-size:12px; font-weight:900; }}
    h1 {{ margin:10px 0; font-size:clamp(34px,5vw,70px); line-height:.95; max-width:1100px; }}
    h2, h3 {{ margin-bottom:8px; }}
    p {{ color:var(--muted); line-height:1.5; }}
    main {{ padding:24px clamp(14px,4vw,52px) 72px; display:grid; gap:18px; }}
    .stats, .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px; }}
    .stat, .comparison, .commands, .panel {{ border:1px solid var(--line); border-radius:24px; background:linear-gradient(180deg,rgba(27,39,31,.96),rgba(9,13,10,.98)); padding:18px; box-shadow:0 18px 42px rgba(0,0,0,.24); }}
    .worksheet {{ border:1px solid var(--line); border-radius:26px; background:linear-gradient(180deg,rgba(44,38,20,.96),rgba(12,16,10,.98)); padding:18px; box-shadow:0 18px 42px rgba(0,0,0,.24); }}
    .worksheet-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px; margin-top:12px; }}
    .worksheet-card {{ border:1px solid var(--line); border-radius:18px; background:rgba(255,255,255,.045); padding:14px; }}
    .stat b {{ font-size:26px; display:block; }}
    video, audio {{ width:100%; max-height:360px; border-radius:14px; background:#050705; object-fit:contain; }}
    pre {{ white-space:pre-wrap; overflow-wrap:anywhere; background:rgba(0,0,0,.28); padding:12px; border-radius:14px; }}
    code {{ overflow-wrap:anywhere; color:var(--ink); }}
    .warn {{ color:var(--clay); font-weight:800; }}
    .truth {{ color:var(--moss); font-weight:800; }}
    a {{ color:var(--water); }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Quipsly Studio sync investigation</div>
    <h1>Episode {packet.get('episode')} {html.escape(str(packet.get('version')))} needs sync evidence, not a blind repair.</h1>
    <p class="truth">{html.escape(str(packet.get('truth') or ''))}</p>
    <p><strong>Diagnosis:</strong> {html.escape(str(packet.get('diagnosis') or ''))}</p>
    <p><strong>Human ask:</strong> {html.escape(str(packet.get('humanAsk') or ''))}</p>
    <p><strong>Agent-safe work:</strong> {html.escape(str(packet.get('agentSafeParallelWork') or ''))}</p>
    <p><strong>Unblocks when:</strong> {html.escape(str(packet.get('unblocksWhen') or ''))}</p>
    <p><strong>Next safe action:</strong> {html.escape(str(packet.get('nextSafestAction') or ''))}</p>
  </header>
  <main>
    <section class="stats">
      <div class="stat"><b>{packet.get('status')}</b><span>Status</span></div>
      <div class="stat"><b>{html.escape(str(packet.get('videoDurationLabel')))}</b><span>Video duration</span></div>
      <div class="stat"><b>{html.escape(str(packet.get('audioDurationLabel')))}</b><span>Podcast audio duration</span></div>
      <div class="stat"><b>{html.escape(str(packet.get('spreadLabel')))}</b><span>Duration spread</span></div>
    </section>
    <section class="worksheet">
      <div class="eyebrow">review worksheet</div>
      <h2>Decide from evidence, not the scary duration number</h2>
      <p>{html.escape(str(worksheet.get('plainEnglish') or 'Compare snippets before choosing hold, restack, trim candidate, or approval path.'))}</p>
      <h3>Checklist</h3>
      <div class="worksheet-grid">{''.join(checklist_rows)}</div>
      <h3>Outcome options</h3>
      <div class="worksheet-grid">{''.join(outcome_rows)}</div>
      <h3>Source/rebuild tasks</h3>
      <div class="worksheet-grid">{source_task_rows}</div>
    </section>
    {''.join(rows)}
    <section class="commands">
      <div class="eyebrow">Preview-first local ledger commands</div>
      <h2>1. Dry-run before any ledger write</h2>
      <ol>{dry_run_commands}</ol>
      <h2>2. Execute only after sync review</h2>
      <ol>{commands}</ol>
    </section>
  </main>
</body>
</html>
""", encoding="utf-8")


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    worksheet = packet.get("reviewWorksheet") if isinstance(packet.get("reviewWorksheet"), dict) else {}
    lines = [
        f"# Episode {packet.get('episode')} {packet.get('version')} sync investigation",
        "",
        packet.get("truth") or "",
        "",
        f"- Status: `{packet.get('status')}`",
        f"- Video duration: `{packet.get('videoDurationLabel')}`",
        f"- Podcast audio duration: `{packet.get('audioDurationLabel')}`",
        f"- Spread: `{packet.get('spreadLabel')}`",
        f"- Manifest: `{packet.get('manifestPath')}`",
        "",
        "## Diagnosis",
        "",
        packet.get("diagnosis") or "",
        "",
        "## Human ask",
        "",
        packet.get("humanAsk") or "",
        "",
        "## Agent-safe parallel work",
        "",
        packet.get("agentSafeParallelWork") or "",
        "",
        "## Unblocks when",
        "",
        packet.get("unblocksWhen") or "",
        "",
        "## Next safest action",
        "",
        packet.get("nextSafestAction") or "",
        "",
        "## Review worksheet",
        "",
        worksheet.get("plainEnglish") or "Compare snippets before choosing hold, restack, trim candidate, or approval path.",
        "",
        "### Checklist",
        "",
    ]
    for item in worksheet.get("checklist") or []:
        lines.extend([
            f"#### {item.get('label')}",
            f"- Question: {item.get('question')}",
            f"- Good sign: {item.get('passSignal')}",
            f"- Concern: {item.get('concernSignal')}",
            f"- Video snippet: `{item.get('videoSnippet') or ''}`",
            f"- Podcast audio snippet: `{item.get('audioSnippet') or ''}`",
            "",
        ])
    lines.extend([
        "### Outcome options",
        "",
    ])
    for outcome in worksheet.get("outcomeOptions") or []:
        lines.extend([
            f"#### {outcome.get('label')}",
            f"- Choose when: {outcome.get('chooseWhen')}",
        ])
        if outcome.get("warning"):
            lines.append(f"- Warning: {outcome.get('warning')}")
        commands = [command for command in outcome.get("dryRunCommands") or [] if command]
        for command in commands:
            lines.extend(["```bash", command, "```"])
        lines.append("")
    lines.extend(["## Source/rebuild tasks", ""])
    for task in packet.get("sourceTasks") or []:
        lines.extend([
            f"### {task.get('label')}",
            f"- Human ask: {task.get('humanAsk')}",
            f"- Agent-safe work: {task.get('agentSafeWork')}",
            f"- Done when: {task.get('doneWhen')}",
            "",
        ])
    lines.extend([
        "## Comparison points",
        "",
    ])
    for comparison in packet.get("comparisons") or []:
        lines.extend([
            f"### {comparison.get('label')}",
            f"- Reason: {comparison.get('reason')}",
            f"- Sequence: `{format_duration(comparison.get('sequenceSeconds'))}`",
            f"- Video start: `{format_duration(comparison.get('videoStartSeconds'))}`",
            f"- Audio start: `{format_duration(comparison.get('audioStartSeconds'))}`",
            f"- Video snippet: `{(comparison.get('videoSnippet') or {}).get('outputPath') or ''}`",
            f"- Podcast audio snippet: `{(comparison.get('audioSnippet') or {}).get('outputPath') or ''}`",
            "",
        ])
    lines.extend(["## Dry-run local ledger commands", ""])
    for label, command in (packet.get("dryRunReviewCommands") or {}).items():
        lines.extend([f"### {label}", "```bash", command, "```", ""])
    lines.extend(["## Execute local ledger commands only after sync review", ""])
    for label, command in (packet.get("reviewCommands") or {}).items():
        lines.extend([f"### {label}", "```bash", command, "```", ""])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_worksheet_markdown(path: Path, packet: dict[str, Any]) -> None:
    worksheet = packet.get("reviewWorksheet") if isinstance(packet.get("reviewWorksheet"), dict) else {}
    lines = [
        f"# Episode {packet.get('episode')} {packet.get('version')} sync review worksheet",
        "",
        packet.get("truth") or "",
        "",
        f"- Status: `{packet.get('status')}`",
        f"- Diagnosis: {packet.get('diagnosis')}",
        f"- Human ask: {packet.get('humanAsk')}",
        f"- Agent-safe work: {packet.get('agentSafeParallelWork')}",
        f"- Unblocks when: {packet.get('unblocksWhen')}",
        f"- Default decision: `{worksheet.get('defaultDecision') or 'hold-current-package-for-sync-review'}`",
        "",
        "## How to use this",
        "",
        worksheet.get("plainEnglish") or "Compare snippets before choosing hold, restack, trim candidate, or approval path.",
        "",
        "## Checklist",
        "",
    ]
    for item in worksheet.get("checklist") or []:
        lines.extend([
            f"### {item.get('label')}",
            f"- Question: {item.get('question')}",
            f"- Good sign: {item.get('passSignal')}",
            f"- Concern: {item.get('concernSignal')}",
            f"- Video snippet: `{item.get('videoSnippet') or ''}`",
            f"- Podcast audio snippet: `{item.get('audioSnippet') or ''}`",
            "",
        ])
    lines.extend(["## Outcome options", ""])
    for outcome in worksheet.get("outcomeOptions") or []:
        lines.extend([
            f"### {outcome.get('label')}",
            f"- Choose when: {outcome.get('chooseWhen')}",
        ])
        if outcome.get("warning"):
            lines.append(f"- Warning: {outcome.get('warning')}")
        commands = [command for command in outcome.get("dryRunCommands") or [] if command]
        if commands:
            lines.append("- Dry-run command(s):")
            for command in commands:
                lines.extend(["```bash", command, "```"])
        lines.append("")
    lines.extend(["## Source/rebuild tasks", ""])
    for task in packet.get("sourceTasks") or []:
        lines.extend([
            f"### {task.get('label')}",
            f"- Human ask: {task.get('humanAsk')}",
            f"- Agent-safe work: {task.get('agentSafeWork')}",
            f"- Done when: {task.get('doneWhen')}",
            "",
        ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_csv(path: Path, packet: dict[str, Any]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        worksheet_by_id = {
            str(item.get("id") or ""): item
            for item in ((packet.get("reviewWorksheet") or {}).get("checklist") or [])
            if isinstance(item, dict)
        }
        writer = csv.DictWriter(handle, fieldnames=["episode", "version", "pointId", "label", "sequenceSeconds", "videoStartSeconds", "audioStartSeconds", "question", "passSignal", "concernSignal", "videoSnippet", "audioSnippet"])
        writer.writeheader()
        for comparison in packet.get("comparisons") or []:
            worksheet_item = worksheet_by_id.get(str(comparison.get("id") or ""), {})
            writer.writerow({
                "episode": packet.get("episode"),
                "version": packet.get("version"),
                "pointId": comparison.get("id"),
                "label": comparison.get("label"),
                "sequenceSeconds": comparison.get("sequenceSeconds"),
                "videoStartSeconds": comparison.get("videoStartSeconds"),
                "audioStartSeconds": comparison.get("audioStartSeconds"),
                "question": worksheet_item.get("question") or "",
                "passSignal": worksheet_item.get("passSignal") or "",
                "concernSignal": worksheet_item.get("concernSignal") or "",
                "videoSnippet": (comparison.get("videoSnippet") or {}).get("outputPath") or "",
                "audioSnippet": (comparison.get("audioSnippet") or {}).get("outputPath") or "",
            })


def update_latest(release_root: Path, packet: dict[str, Any]) -> None:
    pointer = {
        "schema": "quipsly.studio-sync-investigation.latest-pointer.v1",
        "updatedAt": iso_now(),
        "status": packet.get("status"),
        "episode": packet.get("episode"),
        "version": packet.get("version"),
        "sessionDir": packet.get("sessionDir"),
        "jsonPath": packet.get("jsonPath"),
        "htmlPath": packet.get("htmlPath"),
        "markdownPath": packet.get("markdownPath"),
        "worksheetPath": packet.get("worksheetPath"),
        "csvPath": packet.get("csvPath"),
        "counts": packet.get("counts"),
        "durationSpreadSeconds": packet.get("durationSpreadSeconds"),
        "videoDurationSeconds": packet.get("videoDurationSeconds"),
        "audioDurationSeconds": packet.get("audioDurationSeconds"),
        "spreadLabel": packet.get("spreadLabel"),
        "diagnosis": packet.get("diagnosis"),
        "plainEnglishDurationSummary": packet.get("plainEnglishDurationSummary"),
        "humanAsk": packet.get("humanAsk"),
        "agentSafeParallelWork": packet.get("agentSafeParallelWork"),
        "sourceTasks": packet.get("sourceTasks") or [],
        "unblocksWhen": packet.get("unblocksWhen"),
        "primaryLabel": packet.get("primaryLabel"),
        "primaryPath": packet.get("primaryPath"),
        "primaryCommand": packet.get("primaryCommand"),
        "reviewWorksheet": packet.get("reviewWorksheet") or {},
        "nextSafestAction": packet.get("nextSafestAction"),
        "firstSafeAction": packet.get("firstSafeAction"),
        "firstDryRunReviewCommand": next(iter((packet.get("dryRunReviewCommands") or {}).values()), ""),
        "dryRunReviewCommands": packet.get("dryRunReviewCommands") or {},
        "reviewCommandsAfterPreview": packet.get("reviewCommands") or {},
        "manifestPath": packet.get("manifestPath"),
        "sourceFilesMutated": False,
        "originalMediaMutated": False,
        "versionsOverwritten": False,
        "externalPublishing": False,
        "receiptTruthCreated": False,
        "truth": "Pointer only. Sync investigation packets are local evidence, not repairs, approvals, or publication receipts.",
    }
    canonical = release_root / "review-board" / "sync-investigations" / "latest-sync-investigation.json"
    write_json(canonical, pointer)
    write_json(release_root / "review-board" / "latest-sync-investigation.json", {
        **pointer,
        "schema": "quipsly.studio-sync-investigation.latest-alias.v1",
        "canonicalPointerPath": str(canonical),
    })


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a local sync investigation packet for major duration-spread episodes.")
    parser.add_argument("target", nargs="?", default="latest", help="'latest', episode number, manifest path, or version folder.")
    parser.add_argument("--release-root", default=str(DEFAULT_RELEASE_ROOT))
    parser.add_argument("--snippet-seconds", type=float, default=10.0)
    args = parser.parse_args()
    release_root = Path(args.release_root).expanduser()
    target = resolve_target(args.target, release_root)
    packet = build_packet(target, release_root, args.snippet_seconds)
    write_json(Path(str(packet["jsonPath"])), packet)
    write_html(Path(str(packet["htmlPath"])), packet)
    write_markdown(Path(str(packet["markdownPath"])), packet)
    write_worksheet_markdown(Path(str(packet["worksheetPath"])), packet)
    write_csv(Path(str(packet["csvPath"])), packet)
    update_latest(release_root, packet)
    print(json.dumps({
        "ok": packet["status"] == "sync-investigation-ready",
        "status": packet["status"],
        "episode": packet["episode"],
        "version": packet["version"],
        "htmlPath": packet["htmlPath"],
        "jsonPath": packet["jsonPath"],
        "markdownPath": packet["markdownPath"],
        "worksheetPath": packet["worksheetPath"],
        "csvPath": packet["csvPath"],
        "counts": packet["counts"],
        "durationSpreadSeconds": packet["durationSpreadSeconds"],
        "truth": packet["truth"],
    }, indent=2, sort_keys=True))
    return 0 if packet["status"] == "sync-investigation-ready" else 1


if __name__ == "__main__":
    raise SystemExit(main())
