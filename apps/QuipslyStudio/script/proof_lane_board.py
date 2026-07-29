#!/usr/bin/env python3
"""Read-only proof-lane board for Quipsly Studio episode packages.

This utility inspects local Episode_and_Shorts_Test folders and reports what is
ready, what needs review, and what is blocked. It does not mutate media,
manifests, receipts, timelines, or exports.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
EPISODE_RE = re.compile(r"Episode_(\d{2})$")
VERSION_RE = re.compile(r"v(\d{3})$")
MEDIA_SUFFIXES = {".mp4", ".mov", ".m4v", ".m4a", ".wav", ".aiff", ".mp3"}


@dataclass
class MediaProbe:
    path: str
    exists: bool
    sizeBytes: int
    durationSeconds: float | None
    width: int | None
    height: int | None
    hasAudio: bool | None
    hasVideo: bool | None
    error: str


@dataclass
class ProofLane:
    episode: str
    currentVersion: str
    versionPath: str
    status: str
    nextSafestAction: str
    blockers: list[str]
    warnings: list[str]
    files: dict[str, Any]
    counts: dict[str, int]
    publicationReceiptStatus: str


def load_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def newest_version(episode_dir: Path) -> Path | None:
    versions = []
    for child in episode_dir.iterdir() if episode_dir.exists() else []:
        if not child.is_dir():
            continue
        match = VERSION_RE.fullmatch(child.name)
        if match:
            versions.append((int(match.group(1)), child))
    return sorted(versions)[-1][1] if versions else None


def media_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return sorted(
        path
        for path in root.rglob("*")
        if path.is_file() and path.suffix.lower() in MEDIA_SUFFIXES
    )


def classify_media(paths: list[Path]) -> dict[str, list[Path]]:
    video: list[Path] = []
    audio: list[Path] = []
    shorts: list[Path] = []
    for path in paths:
        lowered = str(path).lower()
        suffix = path.suffix.lower()
        if "short" in lowered or "/shorts/" in lowered:
            shorts.append(path)
        elif suffix in {".m4a", ".wav", ".aiff", ".mp3"} or "audio" in lowered or "podcast" in lowered:
            audio.append(path)
        else:
            video.append(path)
    return {"video": video, "audio": audio, "shorts": shorts}


def ffprobe(path: Path, enabled: bool) -> MediaProbe:
    size = path.stat().st_size if path.exists() else 0
    if not enabled:
        return MediaProbe(str(path), path.exists(), size, None, None, None, None, None, "ffprobe skipped")
    try:
        completed = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                str(path),
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=20,
        )
        payload = json.loads(completed.stdout)
        streams = payload.get("streams") or []
        video_stream = next((stream for stream in streams if stream.get("codec_type") == "video"), {})
        audio_stream = next((stream for stream in streams if stream.get("codec_type") == "audio"), {})
        duration_raw = (payload.get("format") or {}).get("duration")
        duration = float(duration_raw) if duration_raw not in (None, "") else None
        return MediaProbe(
            str(path),
            path.exists(),
            size,
            duration,
            int(video_stream["width"]) if "width" in video_stream else None,
            int(video_stream["height"]) if "height" in video_stream else None,
            bool(audio_stream),
            bool(video_stream),
            "",
        )
    except Exception as exc:
        return MediaProbe(str(path), path.exists(), size, None, None, None, None, None, str(exc))


def receipt_status(version_dir: Path, manifest: dict[str, Any]) -> str:
    receipt_markers = []
    for path in version_dir.rglob("*") if version_dir.exists() else []:
        lowered = path.name.lower()
        if path.is_file() and ("receipt" in lowered or "published" in lowered):
            receipt_markers.append(path)
    manifest_receipts = manifest.get("publicationReceipts") or manifest.get("receipts") or []
    if manifest_receipts or receipt_markers:
        return "receipt-evidence-present-review-required"
    return "no platform receipts captured"


def classify_lane(episode_num: int, version_dir: Path | None, root: Path, use_ffprobe: bool) -> ProofLane:
    episode = f"episode-{episode_num:02d}"
    if version_dir is None:
        return ProofLane(
            episode=episode,
            currentVersion="missing",
            versionPath="",
            status="missing-package",
            nextSafestAction="Find or generate a versioned local package before review or publishing work.",
            blockers=["No version folder found."],
            warnings=[],
            files={},
            counts={"video": 0, "audio": 0, "shorts": 0},
            publicationReceiptStatus="no platform receipts captured",
        )

    manifest_path = version_dir / "manifest.json"
    notes_path = version_dir / "notes.md"
    gap_path = version_dir / "sync-gap-report.md"
    manifest = load_json(manifest_path)
    grouped = classify_media(media_files(version_dir))
    probes = {
        key: [asdict(ffprobe(path, use_ffprobe)) for path in paths]
        for key, paths in grouped.items()
    }
    counts = {key: len(paths) for key, paths in grouped.items()}
    blockers: list[str] = []
    warnings: list[str] = []

    if counts["video"] == 0:
        blockers.append("No long-form video file found in current version.")
    if counts["audio"] == 0:
        warnings.append("No audio-only podcast file found in current version.")
    if counts["shorts"] == 0:
        warnings.append("No shorts found in current version.")
    if episode_num == 4:
        warnings.append("Episode 4 source/watched clips are still pending; keep broader progress moving.")

    if use_ffprobe:
        long_video_durations = [
            item["durationSeconds"]
            for item in probes["video"]
            if item["durationSeconds"] and "short" not in item["path"].lower()
        ]
        audio_durations = [item["durationSeconds"] for item in probes["audio"] if item["durationSeconds"]]
        if long_video_durations and audio_durations:
            spread = abs(max(long_video_durations) - max(audio_durations))
            if spread > 10:
                warnings.append(f"Long-form video/audio duration spread is {spread:.1f}s.")

    if blockers:
        status = "blocked"
        next_action = "Resolve blockers or work another proof lane before attempting review/publish steps."
    elif warnings:
        status = "review-needed"
        next_action = "Open current-best package, watch/listen, and mark keep/refine/hold with notes."
    else:
        status = "review-ready"
        next_action = "Watch/listen current best, then prepare manual publishing packets only after approval."

    return ProofLane(
        episode=episode,
        currentVersion=version_dir.name,
        versionPath=str(version_dir),
        status=status,
        nextSafestAction=next_action,
        blockers=blockers,
        warnings=warnings,
        files={
            "manifest": str(manifest_path) if manifest_path.exists() else "",
            "notes": str(notes_path) if notes_path.exists() else "",
            "syncGapReport": str(gap_path) if gap_path.exists() else "",
            "media": probes,
        },
        counts=counts,
        publicationReceiptStatus=receipt_status(version_dir, manifest),
    )


def work_queue_item(lane: ProofLane) -> dict[str, Any]:
    if lane.status == "missing-package":
        lane_type = "package-recovery"
        priority = 90
        action = "Find source package evidence or create a new versioned package without overwriting old exports."
    elif lane.blockers:
        lane_type = "blocker"
        priority = 80
        action = "Resolve blockers or continue another proof lane while this stays visible."
    elif lane.episode == "episode-04":
        lane_type = "episode-4-waiting-room"
        priority = 70
        action = "Keep sync/current-media state clear, but wait for missing watched/source clips before final edit decisions."
    elif lane.warnings:
        lane_type = "review-and-refine"
        priority = 60
        action = "Watch/listen current best, mark keep/refine/hold, then improve package clarity or shorts quality."
    else:
        lane_type = "approval-review"
        priority = 50
        action = "Watch/listen current best; if approved, prepare manual publishing packets and receipt slots."

    return {
        "episode": lane.episode,
        "currentVersion": lane.currentVersion,
        "type": lane_type,
        "priority": priority,
        "status": lane.status,
        "nextAction": action,
        "versionPath": lane.versionPath,
        "blockers": lane.blockers,
        "warnings": lane.warnings,
        "truth": {
            "safeForAgentInspection": True,
            "safeForAutomatedWrite": False,
            "requiresHumanReviewBeforePublishing": True,
        },
    }


def build_work_queue(lanes: list[ProofLane]) -> list[dict[str, Any]]:
    return sorted(
        (work_queue_item(lane) for lane in lanes),
        key=lambda item: (-int(item["priority"]), item["episode"]),
    )


def build_board(root: Path, episodes: list[int], use_ffprobe: bool) -> dict[str, Any]:
    lanes = []
    for episode_num in episodes:
        version_dir = newest_version(root / f"Episode_{episode_num:02d}")
        lanes.append(classify_lane(episode_num, version_dir, root, use_ffprobe))
    work_queue = build_work_queue(lanes)
    return {
        "type": "quipsly.proofLaneBoard",
        "root": str(root),
        "truth": {
            "readOnly": True,
            "mutatesSourceMedia": False,
            "overwritesExports": False,
            "publishesExternally": False,
            "recordsReceipts": False,
        },
        "lanes": [asdict(lane) for lane in lanes],
        "workQueue": work_queue,
        "summary": {
            "ready": sum(1 for lane in lanes if lane.status == "review-ready"),
            "needsReview": sum(1 for lane in lanes if lane.status == "review-needed"),
            "blocked": sum(1 for lane in lanes if lane.status == "blocked"),
            "missing": sum(1 for lane in lanes if lane.status == "missing-package"),
        },
    }


def render_markdown(board: dict[str, Any]) -> str:
    lines = [
        "# Quipsly Studio Proof-Lane Board",
        "",
        f"Root: `{board['root']}`",
        "",
        "Truth: read-only local review evidence. This is not publication approval and not receipt proof.",
        "",
        "## Summary",
        "",
        f"- Ready: `{board['summary']['ready']}`",
        f"- Needs review: `{board['summary']['needsReview']}`",
        f"- Blocked: `{board['summary']['blocked']}`",
        f"- Missing package: `{board['summary']['missing']}`",
        "",
        "## Next Work Queue",
        "",
    ]
    for item in board["workQueue"]:
        lines.extend(
            [
                f"- `{item['episode']}` `{item['type']}` priority `{item['priority']}`: {item['nextAction']}",
            ]
        )
    lines.extend(
        [
            "",
            "## Lanes",
            "",
        ]
    )
    for lane in board["lanes"]:
        lines.extend(
            [
                f"### {lane['episode']} - {lane['currentVersion']}",
                "",
                f"- Status: `{lane['status']}`",
                f"- Version path: `{lane['versionPath']}`",
                f"- Next safest action: {lane['nextSafestAction']}",
                f"- Publication receipts: `{lane['publicationReceiptStatus']}`",
                f"- Counts: video `{lane['counts']['video']}`, audio `{lane['counts']['audio']}`, shorts `{lane['counts']['shorts']}`",
            ]
        )
        if lane["blockers"]:
            lines.append("- Blockers:")
            lines.extend(f"  - {item}" for item in lane["blockers"])
        if lane["warnings"]:
            lines.append("- Warnings:")
            lines.extend(f"  - {item}" for item in lane["warnings"])
        lines.append("")
    return "\n".join(lines)


def parse_episodes(raw: str) -> list[int]:
    episodes = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            start, end = part.split("-", 1)
            episodes.extend(range(int(start), int(end) + 1))
        else:
            episodes.append(int(part))
    return sorted(dict.fromkeys(episodes))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=os.environ.get("QUIPSLY_EPISODE_EXPORT_ROOT", str(DEFAULT_ROOT)))
    parser.add_argument("--episodes", default="1-6")
    parser.add_argument("--format", choices=["json", "markdown"], default="markdown")
    parser.add_argument("--ffprobe", action="store_true", help="Probe media durations/streams. Slower, still read-only.")
    args = parser.parse_args()

    board = build_board(Path(args.root), parse_episodes(args.episodes), args.ffprobe)
    if args.format == "json":
        print(json.dumps(board, indent=2, sort_keys=True))
    else:
        print(render_markdown(board))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
