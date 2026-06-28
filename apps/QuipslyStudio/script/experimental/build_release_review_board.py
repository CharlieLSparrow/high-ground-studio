#!/usr/bin/env python3
"""Build a reviewer/publisher handoff board for Quipsly episode packages.

This script is intentionally non-rendering and non-publishing. It reads the
current package folders, their manifest.json files, and known local artifacts,
then writes a calm review board that answers:

- What should a reviewer open?
- What warnings matter before approval?
- Which platform-prep files exist?
- What is explicitly not published yet?

It never mutates original media and never overwrites episode versions.
"""

from __future__ import annotations

import argparse
import html
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_DURATION_WARNING_REVIEW_POINTER = DEFAULT_ROOT / "review-board/duration-warning-packets/latest-duration-warning-review-packet.json"
PLATFORMS = [
    "YouTube",
    "Podcast/RSS",
    "YouTube Shorts",
    "Instagram",
    "Facebook",
    "LinkedIn",
    "Patreon",
    "HighGroundOdyssey.com",
]


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    return payload if isinstance(payload, dict) else {}


def load_json_if_exists(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return load_json(path)
    except Exception:
        return {}


def load_pointer_target(path: Path) -> dict[str, Any]:
    pointer = load_json_if_exists(path)
    target_path = Path(str(pointer.get("jsonPath") or "")) if pointer.get("jsonPath") else None
    target = load_json_if_exists(target_path) if target_path else {}
    return {**pointer, **target} if target else pointer


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def human_bytes(value: Any) -> str:
    try:
        size = float(value or 0)
    except (TypeError, ValueError):
        size = 0
    units = ["B", "KB", "MB", "GB", "TB"]
    index = 0
    while size >= 1024 and index < len(units) - 1:
        size /= 1024
        index += 1
    if index == 0:
        return f"{int(size)} {units[index]}"
    return f"{size:.1f} {units[index]}"


def human_duration(seconds: Any) -> str:
    try:
        total = int(round(float(seconds or 0)))
    except (TypeError, ValueError):
        total = 0
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours:d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:d}:{secs:02d}"


def path_payload(path_value: str | Path | None) -> dict[str, Any]:
    path = Path(str(path_value)) if path_value else None
    exists = bool(path and path.exists())
    return {
        "path": str(path) if path else "",
        "exists": exists,
        "bytes": path.stat().st_size if exists else 0,
        "fileUri": path.resolve().as_uri() if exists else "",
    }


def artifact_status(item: dict[str, Any]) -> str:
    if not item.get("exists"):
        return "missing"
    if not item.get("bytes"):
        return "empty"
    if item.get("hasVideo") and not item.get("hasAudio"):
        return "video-no-audio"
    if item.get("hasAudio") or item.get("hasVideo"):
        return "ready"
    return "probe-incomplete"


def artifact_payload(label: str, item: dict[str, Any] | None) -> dict[str, Any]:
    item = item or {}
    payload = path_payload(item.get("path"))
    payload.update({
        "label": label,
        "durationSeconds": item.get("durationSeconds") or 0,
        "durationLabel": human_duration(item.get("durationSeconds") or 0),
        "hasAudio": bool(item.get("hasAudio")),
        "hasVideo": bool(item.get("hasVideo")),
        "codecSummary": item.get("codecSummary") or [],
    })
    payload["status"] = artifact_status(payload)
    return payload


def pick_video_item(items: Any, slot: str) -> dict[str, Any]:
    rows = [item for item in (items or []) if isinstance(item, dict)]
    if not rows:
        return {}
    opposite = "9x16" if slot == "16x9" else "16x9"

    def score(item: dict[str, Any]) -> tuple[int, int, str]:
        path = str(item.get("path") or "")
        name = Path(path).name.lower()
        points = 0
        if slot in name:
            points += 1000
        if opposite in name:
            points -= 1000
        if "full-release" in name:
            points += 200
        if "duration-candidate" in name:
            points += 150
        if "release-proof" in name:
            points -= 150
        if "short" in name:
            points -= 800
        return points, int(item.get("bytes") or 0), name

    best = max(rows, key=score)
    return best if slot in str(best.get("path") or "").lower() else {}


def pick_audio_item(items: Any) -> dict[str, Any]:
    rows = [item for item in (items or []) if isinstance(item, dict)]
    if not rows:
        return {}

    def score(item: dict[str, Any]) -> tuple[int, int, str]:
        path = str(item.get("path") or "")
        name = Path(path).name.lower()
        points = 0
        if "podcast-audio" in name:
            points += 1000
        if "full-release" in name:
            points += 200
        if "duration-candidate" in name:
            points += 150
        if "release-proof" in name:
            points -= 150
        if "short" in name:
            points -= 800
        return points, int(item.get("bytes") or 0), name

    return max(rows, key=score)


def probe_duration_seconds(path: Path) -> float:
    if not path.exists():
        return 0.0
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            check=False,
            capture_output=True,
            text=True,
            timeout=8,
        )
        return float((result.stdout or "").strip() or 0)
    except Exception:
        return 0.0


def media_file_candidates(version_dir: Path, extension: str) -> list[Path]:
    if not version_dir.exists():
        return []
    patterns = [f"video/*.{extension}", f"audio/*.{extension}", f"*.{extension}"]
    seen: set[Path] = set()
    paths: list[Path] = []
    for pattern in patterns:
        for path in sorted(version_dir.glob(pattern)):
            if path.is_file() and path not in seen:
                seen.add(path)
                paths.append(path)
    return paths


def pick_video_file(version_dir: Path, slot: str) -> Path | None:
    opposite = "9x16" if slot == "16x9" else "16x9"
    candidates = [path for path in media_file_candidates(version_dir, "mp4") if "short" not in path.name.lower()]
    if not candidates:
        return None

    def score(path: Path) -> tuple[int, int, str]:
        name = path.name.lower()
        points = 0
        if path.parent.name == "video":
            points += 1000
        if slot in name:
            points += 800
        if opposite in name:
            points -= 800
        if "full-release" in name:
            points += 220
        if "duration-candidate" in name:
            points += 180
        if "release-proof" in name:
            points -= 220
        return points, path.stat().st_size if path.exists() else 0, name

    best = max(candidates, key=score)
    return best if slot in best.name.lower() else None


def pick_audio_file(version_dir: Path) -> Path | None:
    candidates = [path for path in media_file_candidates(version_dir, "m4a") if "short" not in path.name.lower()]
    if not candidates:
        return None

    def score(path: Path) -> tuple[int, int, str]:
        name = path.name.lower()
        points = 0
        if path.parent.name == "audio":
            points += 1000
        if "podcast-audio" in name:
            points += 800
        if "full-release" in name:
            points += 220
        if "duration-candidate" in name:
            points += 180
        if "release-proof" in name:
            points -= 220
        return points, path.stat().st_size if path.exists() else 0, name

    return max(candidates, key=score)


def file_artifact(path: Path | None, *, has_video: bool, has_audio: bool) -> dict[str, Any]:
    if not path:
        return {}
    return {
        "path": str(path),
        "exists": path.exists(),
        "bytes": path.stat().st_size if path.exists() else 0,
        "durationSeconds": probe_duration_seconds(path),
        "hasAudio": has_audio,
        "hasVideo": has_video,
        "codecSummary": [],
        "source": "version-folder-fallback",
    }


def primary_artifacts(manifest: dict[str, Any], version_dir: Path) -> dict[str, Any]:
    artifacts = manifest.get("artifacts") if isinstance(manifest.get("artifacts"), dict) else {}
    if artifacts:
        return {
            "videoMaster16x9": artifacts.get("videoMaster16x9") or {},
            "videoMaster9x16": artifacts.get("videoMaster9x16") or {},
            "audioOnlyPodcast": artifacts.get("audioOnlyPodcast") or {},
        }
    return {
        "videoMaster16x9": pick_video_item(manifest.get("video"), "16x9") or file_artifact(pick_video_file(version_dir, "16x9"), has_video=True, has_audio=True),
        "videoMaster9x16": pick_video_item(manifest.get("video"), "9x16") or file_artifact(pick_video_file(version_dir, "9x16"), has_video=True, has_audio=True),
        "audioOnlyPodcast": pick_audio_item(manifest.get("audio")) or file_artifact(pick_audio_file(version_dir), has_video=False, has_audio=True),
    }


def discover_publish_packets(version_dir: Path) -> dict[str, Any]:
    publish_dirs = sorted(p for p in version_dir.glob("*publish-packet*") if p.is_dir())
    podcast_dirs = sorted(p for p in version_dir.glob("*podcast-packet*") if p.is_dir())
    platform_prep_dirs = sorted(p for p in version_dir.glob("platform-prep") if p.is_dir())
    metadata_files = []
    checklist_files = []
    upload_job_files = []
    podcast_manifests = []
    for directory in [*publish_dirs, *podcast_dirs, *platform_prep_dirs]:
        metadata_files.extend(sorted(directory.rglob("*-metadata.json")))
        checklist_files.extend(sorted(directory.rglob("*-checklist.md")))
        upload_job_files.extend(sorted(directory.rglob("*-upload-job.json")))
        podcast_manifests.extend(sorted(directory.rglob("*podcast-manifest.json")))

    platform_hits = {platform: 0 for platform in PLATFORMS}
    for path in [*metadata_files, *checklist_files, *upload_job_files, *podcast_manifests]:
        name = path.name.lower()
        if "youtube-shorts" in name:
            platform_hits["YouTube Shorts"] += 1
        if "youtube-episode" in name or "youtube" in name and "shorts" not in name:
            platform_hits["YouTube"] += 1
        if "instagram" in name:
            platform_hits["Instagram"] += 1
        if "facebook" in name:
            platform_hits["Facebook"] += 1
        if "linkedin" in name:
            platform_hits["LinkedIn"] += 1
        if "patreon" in name:
            platform_hits["Patreon"] += 1
        if "podcast" in name or "apple-podcasts" in name or "spotify" in name:
            platform_hits["Podcast/RSS"] += 1
        if "highgroundodyssey" in name or "hgo" in name or "episode-page" in name:
            platform_hits["HighGroundOdyssey.com"] += 1

    return {
        "publishPacketDirs": [str(p) for p in publish_dirs],
        "podcastPacketDirs": [str(p) for p in podcast_dirs],
        "platformPrepDirs": [str(p) for p in platform_prep_dirs],
        "metadataFileCount": len(metadata_files),
        "checklistFileCount": len(checklist_files),
        "uploadJobFileCount": len(upload_job_files),
        "podcastManifestCount": len(podcast_manifests),
        "platformHits": platform_hits,
        "readyPlatforms": [platform for platform, count in platform_hits.items() if count > 0],
        "missingPlatforms": [platform for platform, count in platform_hits.items() if count == 0],
        "sampleFiles": [str(p) for p in [*metadata_files, *checklist_files, *upload_job_files, *podcast_manifests][:12]],
    }


def discovered_short_payloads(version_dir: Path) -> list[dict[str, Any]]:
    candidates: list[Path] = []
    shorts_dir = version_dir / "shorts"
    if shorts_dir.exists():
        candidates.extend(sorted(path for path in shorts_dir.rglob("*.mp4") if path.is_file()))
    if not candidates and version_dir.exists():
        candidates.extend(sorted(path for path in version_dir.glob("*short*.mp4") if path.is_file()))
    rows: list[dict[str, Any]] = []
    for index, path in enumerate(candidates, start=1):
        payload = path_payload(path)
        payload.update({
            "index": index,
            "title": path.stem,
            "durationSeconds": 0,
            "durationLabel": "",
            "hasAudio": True,
            "hasVideo": True,
            "codecSummary": [],
        })
        payload["status"] = artifact_status(payload)
        rows.append(payload)
    return rows


def short_payloads(manifest: dict[str, Any], version_dir: Path) -> list[dict[str, Any]]:
    shorts = []
    for index, item in enumerate(manifest.get("shorts") or [], start=1):
        if not isinstance(item, dict):
            continue
        payload = path_payload(item.get("path"))
        payload.update({
            "index": index,
            "title": item.get("title") or Path(str(item.get("path") or f"short-{index}")).stem,
            "durationSeconds": item.get("durationSeconds") or 0,
            "durationLabel": human_duration(item.get("durationSeconds") or 0),
            "hasAudio": bool(item.get("hasAudio")),
            "hasVideo": bool(item.get("hasVideo")),
            "codecSummary": item.get("codecSummary") or [],
        })
        payload["status"] = artifact_status(payload)
        shorts.append(payload)
    return shorts or discovered_short_payloads(version_dir)


def duration_warning_by_episode(root: Path) -> dict[int, dict[str, Any]]:
    packet = load_pointer_target(root / "review-board/duration-warning-packets/latest-duration-warning-review-packet.json")
    rows: dict[int, dict[str, Any]] = {}
    for item in packet.get("episodes") or []:
        if not isinstance(item, dict):
            continue
        try:
            episode_number = int(item.get("episode") or 0)
        except (TypeError, ValueError):
            continue
        if episode_number:
            rows[episode_number] = item
    return rows


def duration_warning_text(summary: dict[str, Any]) -> str:
    spread = str(summary.get("spreadLabel") or "")
    plain = str(summary.get("plainEnglish") or "Long-form video/audio durations differ; review whether this is intentional before publishing.")
    shortest = summary.get("shortestArtifact") if isinstance(summary.get("shortestArtifact"), dict) else {}
    longest = summary.get("longestArtifact") if isinstance(summary.get("longestArtifact"), dict) else {}
    suffix = ""
    if shortest or longest:
        suffix = f" Shortest: {shortest.get('label', 'unknown')} {shortest.get('durationLabel', '')}; longest: {longest.get('label', 'unknown')} {longest.get('durationLabel', '')}."
    return f"Duration warning ({spread}): {plain}{suffix}".strip()


def load_release_status(root: Path) -> dict[str, Any]:
    path = root / "release-status.json"
    if path.exists():
        try:
            return load_json(path)
        except Exception:
            return {}
    return {}


def choose_episode_dirs(root: Path, release_status: dict[str, Any]) -> list[tuple[int, Path, str]]:
    choices: list[tuple[int, Path, str]] = []
    status_by_episode = {
        int(item.get("episode")): item
        for item in release_status.get("episodes") or []
        if isinstance(item, dict) and str(item.get("episode") or "").isdigit()
    }
    for episode in range(1, 7):
        status_item = status_by_episode.get(episode) or {}
        version_dir_value = status_item.get("versionDir")
        version_dir = Path(str(version_dir_value)) if version_dir_value else None
        if not version_dir or not version_dir.exists():
            episode_dir = root / f"Episode_{episode:02d}"
            candidates = sorted(
                (p for p in episode_dir.glob("v*") if p.is_dir() and (p / "manifest.json").exists()),
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )
            version_dir = candidates[0] if candidates else episode_dir / "missing"
        version_label = status_item.get("version") or version_dir.name
        choices.append((episode, version_dir, str(version_label)))
    return choices


def episode_next_action(episode: dict[str, Any]) -> str:
    missing = []
    for artifact in episode.get("artifacts", {}).values():
        if artifact.get("status") not in {"ready", "video-no-audio"}:
            missing.append(artifact.get("label", "artifact"))
    short_count = len(episode.get("shorts") or [])
    warnings = episode.get("warnings") or []
    if missing:
        return "Repair or regenerate missing local artifacts before human review: " + ", ".join(missing)
    if short_count < 5:
        return "Create or export at least five reviewable shorts before social review."
    if warnings:
        return "Human watch/listen pass required before publishing; warning is documented, not fatal to local review."
    if not episode.get("platformPrep", {}).get("readyPlatforms"):
        return "Generate platform metadata/checklists, then review local artifacts."
    return "Watch/listen current best, mark approve/refine, then prepare manual upload and capture receipts."


def build_board(root: Path) -> dict[str, Any]:
    release_status = load_release_status(root)
    duration_warnings = duration_warning_by_episode(root)
    episodes = []
    for episode_number, version_dir, version_label in choose_episode_dirs(root, release_status):
        manifest_path = version_dir / "manifest.json"
        manifest = load_json(manifest_path) if manifest_path.exists() else {}
        artifacts = primary_artifacts(manifest, version_dir)
        warnings = list(manifest.get("warnings") or [])
        duration_warning = duration_warnings.get(episode_number) or {}
        if duration_warning:
            text = duration_warning_text(duration_warning)
            warnings = [
                warning for warning in warnings
                if not (
                    "duration" in str(warning).lower()
                    or ("video/audio" in str(warning).lower() and "differ" in str(warning).lower())
                )
            ]
            if text and text not in warnings:
                warnings.append(text)
        spread_seconds = manifest.get("longFormDurationSpreadSeconds") or duration_warning.get("spreadSeconds") or 0
        episode = {
            "episode": episode_number,
            "version": version_label,
            "versionDir": str(version_dir),
            "manifestPath": str(manifest_path) if manifest_path.exists() else "",
            "notesPath": str(version_dir / "notes.md") if (version_dir / "notes.md").exists() else "",
            "syncGapReportPath": str(version_dir / "sync-gap-report.md") if (version_dir / "sync-gap-report.md").exists() else "",
            "status": manifest.get("status") or "needs-packet",
            "generatedAt": manifest.get("generatedAt") or "",
            "warnings": warnings,
            "longFormDurationSpreadSeconds": spread_seconds,
            "longFormDurationAlignmentReady": bool(manifest.get("longFormDurationAlignmentReady")) and not duration_warning,
            "publicationReceiptStatus": "no platform receipts captured",
            "publicationTruth": manifest.get("publicationTruth") or "Local artifact readiness only. Not published until a platform receipt or URL exists.",
            "artifacts": {
                "longForm16x9": artifact_payload("Long-form 16:9 video", artifacts.get("videoMaster16x9")),
                "longForm9x16": artifact_payload("Long-form 9:16 video", artifacts.get("videoMaster9x16")),
                "podcastAudio": artifact_payload("Audio-only podcast/RSS", artifacts.get("audioOnlyPodcast")),
            },
            "shorts": short_payloads(manifest, version_dir),
            "platformPrep": discover_publish_packets(version_dir),
            "session": manifest.get("session") or {},
        }
        episode["shortCount"] = len(episode["shorts"])
        episode["readyArtifactCount"] = sum(1 for item in episode["artifacts"].values() if item.get("status") in {"ready", "video-no-audio"})
        episode["readyShortCount"] = sum(1 for item in episode["shorts"] if item.get("status") == "ready")
        episode["nextSafestAction"] = episode_next_action(episode)
        episodes.append(episode)

    warning_count = sum(len(ep["warnings"]) for ep in episodes)
    return {
        "packetType": "quipsly-release-review-board",
        "version": "2026-06-24.release-review-board.v1",
        "generatedAt": iso_now(),
        "root": str(root),
        "truth": "Reviewer/publisher handoff only. This board does not upload, publish, schedule, approve, or capture external receipts.",
        "episodeCount": len(episodes),
        "warningCount": warning_count,
        "episodesManualReviewReady": sum(1 for ep in episodes if ep["status"] == "manual-review-ready"),
        "episodesWithWarnings": [ep["episode"] for ep in episodes if ep["warnings"]],
        "episodes": episodes,
    }


def md_link(path: str, label: str) -> str:
    if not path:
        return f"{label}: missing"
    return f"[{label}]({path})"


def render_markdown(board: dict[str, Any]) -> str:
    root = Path(str(board["root"]))
    validation_path = root / "review-board" / "release-validation.md"
    ledger_path = root / "review-board" / "human-review-ledger.md"
    lines = [
        "# Quipsly Episode Review Board",
        "",
        f"Generated: `{board['generatedAt']}`",
        "",
        "> Local readiness only. Nothing here means public publication until a platform receipt or URL is captured.",
        "",
        "## Start here",
        "",
        "1. Open the current-best long-form 16:9 video for the episode.",
        "2. Listen to the podcast audio file, especially episodes with duration warnings.",
        "3. Watch at least five shorts and mark approve/refine/reject outside this board for now.",
        "4. Use metadata/checklist packets for manual upload prep.",
        "5. After publishing elsewhere, capture the platform URL/receipt separately.",
        "",
        "## Companion files",
        "",
        f"- Validation report: `{validation_path}`",
        f"- Human review and receipt ledger: `{ledger_path}`",
        "",
        "## Summary",
        "",
        f"- Episodes listed: `{board['episodeCount']}`",
        f"- Manual-review-ready packages: `{board['episodesManualReviewReady']}`",
        f"- Episodes with warnings: `{', '.join(map(str, board['episodesWithWarnings'])) or 'none'}`",
        "",
    ]
    for ep in board["episodes"]:
        lines.extend([
            f"## Episode {ep['episode']:02d} - {ep['version']}",
            "",
            f"- Status: `{ep['status']}`",
            f"- Version folder: `{ep['versionDir']}`",
            f"- Next safest action: **{ep['nextSafestAction']}**",
            f"- Publication receipt status: `{ep['publicationReceiptStatus']}`",
            f"- Notes: {md_link(ep['notesPath'], 'notes.md')}",
            f"- Manifest: {md_link(ep['manifestPath'], 'manifest.json')}",
            f"- Sync/gap report: {md_link(ep['syncGapReportPath'], 'sync-gap-report.md')}",
            "",
            "### Review files",
            "",
        ])
        for artifact in ep["artifacts"].values():
            lines.append(
                f"- {artifact['label']}: `{artifact['status']}` | {artifact['durationLabel']} | {human_bytes(artifact['bytes'])} | `{artifact['path']}`"
            )
        lines.extend([
            "",
            f"### Shorts ({ep['readyShortCount']}/{ep['shortCount']} ready)",
            "",
        ])
        for short in ep["shorts"][:12]:
            lines.append(
                f"- {short['index']:02d}. `{short['status']}` | {short['durationLabel']} | {short['title']} | `{short['path']}`"
            )
        if ep["shortCount"] > 12:
            lines.append(f"- ... {ep['shortCount'] - 12} more short(s) in manifest.json")
        lines.extend([
            "",
            "### Platform prep",
            "",
            f"- Ready platforms with local packet evidence: `{', '.join(ep['platformPrep']['readyPlatforms']) or 'none yet'}`",
            f"- Missing platform packet evidence: `{', '.join(ep['platformPrep']['missingPlatforms']) or 'none'}`",
            f"- Metadata files: `{ep['platformPrep']['metadataFileCount']}`; checklists: `{ep['platformPrep']['checklistFileCount']}`; upload jobs: `{ep['platformPrep']['uploadJobFileCount']}`",
            "",
            "### Warnings",
            "",
        ])
        if ep["warnings"]:
            for warning in ep["warnings"]:
                lines.append(f"- {warning}")
        else:
            lines.append("- No package warnings recorded.")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def render_html(board: dict[str, Any]) -> str:
    root = Path(str(board["root"]))
    validation_uri = (root / "review-board" / "release-validation.md").resolve().as_uri()
    ledger_uri = (root / "review-board" / "human-review-ledger.md").resolve().as_uri()
    cards = []
    for ep in board["episodes"]:
        warning_html = "".join(f"<li>{html.escape(str(w))}</li>" for w in ep["warnings"]) or "<li>No package warnings recorded.</li>"
        artifact_rows = []
        for artifact in ep["artifacts"].values():
            link = f"<a href='{html.escape(artifact['fileUri'])}'>open</a>" if artifact.get("fileUri") else "missing"
            artifact_rows.append(
                f"<tr><td>{html.escape(artifact['label'])}</td><td>{html.escape(artifact['status'])}</td><td>{artifact['durationLabel']}</td><td>{human_bytes(artifact['bytes'])}</td><td>{link}</td></tr>"
            )
        wide_video = ep["artifacts"]["longForm16x9"]
        vertical_video = ep["artifacts"]["longForm9x16"]
        podcast_audio = ep["artifacts"]["podcastAudio"]
        wide_player = (
            f"<video controls preload='metadata' src='{html.escape(wide_video['fileUri'])}'></video>"
            if wide_video.get("fileUri") else "<div class='missing-player'>16:9 video missing</div>"
        )
        vertical_player = (
            f"<video controls preload='metadata' src='{html.escape(vertical_video['fileUri'])}'></video>"
            if vertical_video.get("fileUri") else "<div class='missing-player'>9:16 video missing</div>"
        )
        audio_player = (
            f"<audio controls preload='metadata' src='{html.escape(podcast_audio['fileUri'])}'></audio>"
            if podcast_audio.get("fileUri") else "<div class='missing-player'>Podcast audio missing</div>"
        )
        short_items = []
        for short in ep["shorts"][:8]:
            link = f"<a href='{html.escape(short['fileUri'])}'>open</a>" if short.get("fileUri") else "missing"
            short_items.append(f"<li><strong>{short['index']:02d}</strong> {html.escape(short['title'])} <span>{short['durationLabel']}</span> {link}</li>")
        short_players = []
        for short in ep["shorts"][:5]:
            if short.get("fileUri"):
                short_players.append(
                    "<figure class='short-player'>"
                    f"<video controls preload='metadata' src='{html.escape(short['fileUri'])}'></video>"
                    f"<figcaption>{short['index']:02d}. {html.escape(short['title'])}</figcaption>"
                    "</figure>"
                )
        platforms = ", ".join(ep["platformPrep"]["readyPlatforms"]) or "none yet"
        cards.append(f"""
<section class='card {'warn' if ep['warnings'] else 'ready'}'>
  <div class='card-head'>
    <p class='eyebrow'>Episode {ep['episode']:02d} / {html.escape(ep['version'])}</p>
    <span class='pill'>{html.escape(ep['status'])}</span>
  </div>
  <h2>Current best package</h2>
  <p class='next'>{html.escape(ep['nextSafestAction'])}</p>
  <p class='receipt'>Receipt truth: {html.escape(ep['publicationReceiptStatus'])}</p>
  <details open>
    <summary>Review players</summary>
    <div class='players'>
      <div><h4>16:9 long-form</h4>{wide_player}</div>
      <div><h4>9:16 vertical</h4>{vertical_player}</div>
    </div>
    <h4>Podcast audio</h4>
    {audio_player}
    <h4>First shorts</h4>
    <div class='short-grid'>{''.join(short_players)}</div>
  </details>
  <table><thead><tr><th>Artifact</th><th>Status</th><th>Duration</th><th>Size</th><th>Path</th></tr></thead><tbody>{''.join(artifact_rows)}</tbody></table>
  <h3>Shorts {ep['readyShortCount']}/{ep['shortCount']} ready</h3>
  <ul class='shorts'>{''.join(short_items)}</ul>
  <h3>Platform prep</h3>
  <p>{html.escape(platforms)}</p>
  <h3>Warnings</h3>
  <ul>{warning_html}</ul>
  <p class='paths'><a href='{Path(ep['versionDir']).resolve().as_uri()}'>Open version folder</a></p>
</section>
""")
    return f"""<!doctype html>
<html lang='en'>
<head>
<meta charset='utf-8'>
<title>Quipsly Episode Review Board</title>
<style>
:root {{ color-scheme: dark; --bg:#101914; --panel:#17231c; --leaf:#8dcc87; --honey:#f2c14e; --clay:#e07555; --text:#f3ead7; --muted:#adbaa8; }}
body {{ margin:0; font-family: Avenir Next, ui-sans-serif, system-ui, sans-serif; background: radial-gradient(circle at top left, #243c2d, var(--bg) 45%); color:var(--text); }}
main {{ max-width:1180px; margin:0 auto; padding:40px 24px 80px; }}
h1 {{ font-size:44px; margin:0 0 8px; letter-spacing:-0.04em; }}
.lede {{ color:var(--muted); max-width:760px; line-height:1.5; }}
.summary {{ display:flex; gap:12px; flex-wrap:wrap; margin:24px 0; }}
.summary span, .pill {{ border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.07); border-radius:999px; padding:8px 12px; font-weight:800; }}
.card {{ background:linear-gradient(145deg, rgba(255,255,255,.06), rgba(255,255,255,.025)); border:1px solid rgba(255,255,255,.12); border-radius:24px; padding:22px; margin:18px 0; box-shadow:0 18px 60px rgba(0,0,0,.24); }}
.card.warn {{ border-color:rgba(242,193,78,.45); }}
.card-head {{ display:flex; justify-content:space-between; gap:16px; align-items:center; }}
.eyebrow {{ color:var(--honey); text-transform:uppercase; letter-spacing:.18em; font-size:12px; font-weight:900; margin:0; }}
h2 {{ margin:8px 0 8px; font-size:28px; }}
h3 {{ color:var(--leaf); margin-top:18px; }}
.next {{ font-weight:800; color:var(--text); }}
.receipt {{ color:var(--muted); }}
table {{ width:100%; border-collapse:collapse; overflow:hidden; border-radius:14px; margin-top:12px; }}
th, td {{ padding:10px; border-bottom:1px solid rgba(255,255,255,.08); text-align:left; vertical-align:top; }}
th {{ color:var(--honey); font-size:12px; text-transform:uppercase; letter-spacing:.08em; }}
a {{ color:#8bd3ff; text-decoration:none; font-weight:800; }}
ul {{ padding-left:20px; }}
details {{ background:rgba(0,0,0,.15); border:1px solid rgba(255,255,255,.08); border-radius:18px; padding:14px; margin:16px 0; }}
summary {{ cursor:pointer; color:var(--honey); font-weight:900; text-transform:uppercase; letter-spacing:.08em; }}
.players {{ display:grid; grid-template-columns:minmax(0,2fr) minmax(220px,1fr); gap:14px; align-items:start; }}
video {{ width:100%; max-height:420px; border-radius:16px; background:#050806; border:1px solid rgba(255,255,255,.12); }}
audio {{ width:100%; margin:6px 0 12px; }}
.short-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; }}
.short-player {{ margin:0; }}
.short-player video {{ max-height:260px; object-fit:contain; }}
figcaption {{ color:var(--muted); font-size:12px; margin-top:6px; }}
.missing-player {{ padding:24px; border:1px dashed rgba(255,255,255,.18); border-radius:14px; color:var(--muted); }}
.shorts li {{ margin:7px 0; color:var(--muted); }}
.shorts strong {{ color:var(--honey); }}
.paths {{ margin-bottom:0; }}
</style>
</head>
<body><main>
<h1>Quipsly Episode Review Board</h1>
<p class='lede'>Generated {html.escape(board['generatedAt'])}. Local readiness only: this board helps humans review, refine, package, and capture receipts. It does not publish anything.</p>
<div class='summary'><span>{board['episodeCount']} episodes</span><span>{board['episodesManualReviewReady']} manual-review-ready</span><span>{board['warningCount']} warning(s)</span></div>
<p class='lede'><a href='{html.escape(validation_uri)}'>Validation report</a> · <a href='{html.escape(ledger_uri)}'>Human review and receipt ledger</a></p>
{''.join(cards)}
</main></body></html>
"""


def write_release_status_markdown(root: Path, board: dict[str, Any]) -> None:
    path = root / "release-status.md"
    path.write_text(render_markdown(board), encoding="utf-8")


def update_release_status_json(root: Path, board: dict[str, Any], board_dir: Path) -> None:
    path = root / "release-status.json"
    payload = load_release_status(root)
    payload.update({
        "generatedAt": board["generatedAt"],
        "root": str(root),
        "truth": "Local manual-publishable artifact readiness only. Publication still requires human review and platform receipts.",
        "reviewBoard": {
            "jsonPath": str(board_dir / "review-board.json"),
            "markdownPath": str(board_dir / "START-HERE-review-board.md"),
            "htmlPath": str(board_dir / "index.html"),
            "generatedAt": board["generatedAt"],
            "warningCount": board["warningCount"],
            "episodesWithWarnings": board["episodesWithWarnings"],
        },
        "episodes": [
            {
                "episode": ep["episode"],
                "version": ep["version"],
                "versionDir": ep["versionDir"],
                "status": ep["status"],
                "shortCount": ep["shortCount"],
                "readyShortCount": ep["readyShortCount"],
                "mediaFileCount": ep["readyArtifactCount"] + ep["readyShortCount"],
                "longFormDurationReady": True,
                "longFormDurationAlignmentReady": ep["longFormDurationAlignmentReady"],
                "longFormDurationSpreadSeconds": ep["longFormDurationSpreadSeconds"],
                "warnings": ep["warnings"],
                "nextSafestAction": ep["nextSafestAction"],
                "publicationReceiptStatus": ep["publicationReceiptStatus"],
                "platformPrepReadyPlatforms": ep["platformPrep"]["readyPlatforms"],
            }
            for ep in board["episodes"]
        ],
    })
    write_json(path, payload)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Quipsly local release review board.")
    parser.add_argument("root", nargs="?", type=Path, default=DEFAULT_ROOT)
    args = parser.parse_args()
    root = args.root.expanduser().resolve()
    if not root.exists():
        raise SystemExit(f"Release root not found: {root}")

    board = build_board(root)
    board_dir = root / "review-board"
    board_dir.mkdir(parents=True, exist_ok=True)
    json_path = board_dir / "review-board.json"
    md_path = board_dir / "START-HERE-review-board.md"
    html_path = board_dir / "index.html"

    write_json(json_path, board)
    md_path.write_text(render_markdown(board), encoding="utf-8")
    html_path.write_text(render_html(board), encoding="utf-8")
    write_release_status_markdown(root, board)
    update_release_status_json(root, board, board_dir)

    print(json.dumps({
        "ok": True,
        "root": str(root),
        "jsonPath": str(json_path),
        "markdownPath": str(md_path),
        "htmlPath": str(html_path),
        "episodeCount": board["episodeCount"],
        "warningCount": board["warningCount"],
        "episodesWithWarnings": board["episodesWithWarnings"],
        "truth": board["truth"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
