#!/usr/bin/env python3
"""Prepare Quipsly versioned episode export workspace.

This script is intentionally conservative:
- copies existing derivative proof exports only;
- never touches original source media;
- creates manifests, notes, and blocker reports for missing work;
- gives Codex/Mako/Charlie one stable folder to inspect while production continues.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

APP_ROOT = Path(__file__).resolve().parents[1]
DESKTOP_BLOCKERS = Path("/Users/wall-e/Desktop/Quipsly_Episode_Export_Blockers.md")
DEFAULT_EXPORT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
PROOF_DOCS = {
    1: APP_ROOT / "docs/quipsly/current-state/episode-1-five-short-export-proof-2026-06-23.md",
    2: APP_ROOT / "docs/quipsly/current-state/episodes-2-3-five-short-export-proof-2026-06-23.md",
    3: APP_ROOT / "docs/quipsly/current-state/episodes-2-3-five-short-export-proof-2026-06-23.md",
}
SESSION_HINTS = {
    1: "episode-1-codex-real-edit-v1-youtube-wordtimed",
    2: "episode-2-codex-overlap-review-v3-wordtimed",
    3: "episode-3-premiere-rescue-youtube-wordtimed",
    4: "episode-4 pending sync assessment",
    5: "episode-5 pending sync assessment",
    6: "episode-6 media available; sync assessment next",
}
EPISODE_MEDIA_HINTS = {
    1: "/Volumes/My Passport/Episode 1",
    2: "/Volumes/My Passport/Episode 2",
    3: "/Volumes/My Passport/Episode 3",
    4: "/Volumes/My Passport/Episode 4",
    5: "/Volumes/My Passport/Episode 5",
    6: "/Volumes/My Passport/Episode 6",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def safe_copy(src: Path, dst: Path) -> dict[str, Any]:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        return {"source": str(src), "path": str(dst), "copied": False, "reason": "already exists", "bytes": dst.stat().st_size}
    shutil.copy2(src, dst)
    return {"source": str(src), "path": str(dst), "copied": True, "bytes": dst.stat().st_size}


def probe_media(path: Path) -> dict[str, Any]:
    result: dict[str, Any] = {"path": str(path), "exists": path.exists(), "bytes": path.stat().st_size if path.exists() else 0}
    if not path.exists():
        return result
    try:
        completed = subprocess.run(
            [
                "ffprobe",
                "-v", "error",
                "-show_entries", "format=duration:stream=codec_type,width,height",
                "-of", "json",
                str(path),
            ],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=20,
        )
        if completed.returncode == 0:
            payload = json.loads(completed.stdout or "{}")
            result["ffprobe"] = payload
            duration = (payload.get("format") or {}).get("duration")
            if duration is not None:
                result["durationSeconds"] = round(float(duration), 3)
            streams = payload.get("streams") or []
            result["hasVideo"] = any(stream.get("codec_type") == "video" for stream in streams)
            result["hasAudio"] = any(stream.get("codec_type") == "audio" for stream in streams)
        else:
            result["probeWarning"] = completed.stderr.strip()[:500]
    except Exception as exc:  # noqa: BLE001 - diagnostic path should stay calm
        result["probeWarning"] = str(exc)
    return result


def extract_episode_section(markdown: str, episode: int) -> str:
    if episode == 1:
        return markdown
    start = markdown.find(f"## Episode {episode} export smoke")
    if start < 0:
        return ""
    next_start = markdown.find(f"## Episode {episode + 1} export smoke", start + 1)
    if next_start < 0:
        next_start = markdown.find("## Current meaning", start + 1)
    if next_start < 0:
        next_start = len(markdown)
    return markdown[start:next_start]


def proof_short_paths(episode: int) -> list[Path]:
    doc = PROOF_DOCS.get(episode)
    if not doc or not doc.exists():
        return []
    section = extract_episode_section(doc.read_text(encoding="utf-8"), episode)
    paths = []
    for match in re.findall(r"`([^`]+?\.mp4)`", section):
        path = Path(match)
        if path.exists() and "short" in path.name.lower():
            paths.append(path)
    unique: list[Path] = []
    seen = set()
    for path in paths:
        if path not in seen:
            seen.add(path)
            unique.append(path)
    return unique[:5]


def existing_media_artifacts(directory: Path, extensions: set[str]) -> list[dict[str, Any]]:
    if not directory.exists():
        return []
    artifacts: list[dict[str, Any]] = []
    for path in sorted(directory.iterdir()):
        if not path.is_file():
            continue
        if path.suffix.lower() not in extensions:
            continue
        entry = probe_media(path)
        entry["path"] = str(path)
        entry["source"] = "existing-v001-artifact"
        entry["copied"] = False
        artifacts.append(entry)
    return artifacts


def v001_status(shorts: list[dict[str, Any]], video: list[dict[str, Any]], audio: list[dict[str, Any]]) -> str:
    if len(shorts) >= 5 and video and audio:
        return "v001-proof-package-ready"
    if shorts or video or audio:
        return "partial-v001-artifacts-ready"
    return "gap-report-created"


def write_episode_notes(
    episode: int,
    version_dir: Path,
    copied_shorts: list[dict[str, Any]],
    video_artifacts: list[dict[str, Any]],
    audio_artifacts: list[dict[str, Any]],
    blockers: list[dict[str, Any]],
) -> None:
    lines = [
        f"# Episode {episode:02d} v001 export notes",
        "",
        f"Generated: {now_iso()}",
        "",
        "## What exists in this version",
        "",
    ]
    if copied_shorts:
        lines.append(f"- {len(copied_shorts)} proxy-based 9:16 short proof exports copied into `shorts/`.")
        lines.append("- These are derivative exports from Quipsly short recipes; original media was not touched.")
    else:
        lines.append("- No short exports copied yet for this episode.")
    if video_artifacts:
        lines.append(f"- {len(video_artifacts)} long-form/proof video artifact(s) found in `video/`.")
    else:
        lines.append("- No long-form/proof video artifact found in `video/` yet.")
    if audio_artifacts:
        lines.append(f"- {len(audio_artifacts)} podcast/proof audio artifact(s) found in `audio/`.")
    else:
        lines.append("- No podcast/proof audio artifact found in `audio/` yet.")
    lines.extend([
        "- Long-form video and podcast audio exports are claimed only when files exist in `video/` and `audio/`.",
        "",
        "## Human review state",
        "",
        "- v001 is proof-of-work, not final publication approval.",
        "- Watch/listen review is still required before manual publishing.",
        "",
        "## Current blockers / gaps",
        "",
    ])
    for blocker in blockers:
        lines.append(f"- **{blocker['area']}**: {blocker['what']}")
    lines.append("")
    (version_dir / "notes.md").write_text("\n".join(lines), encoding="utf-8")


def write_missing_report(episode: int, version_dir: Path, blockers: list[dict[str, Any]]) -> None:
    lines = [
        f"# Episode {episode:02d} missing media and sync notes",
        "",
        f"Last updated: {now_iso()}",
        "",
        "This file exists so one troublesome episode does not stop the whole production sprint.",
        "",
    ]
    for blocker in blockers:
        lines.extend([
            f"## {blocker['area']}",
            "",
            f"- What is blocked: {blocker['what']}",
            f"- Blocks: {blocker['blocks']}",
            f"- What Codex can still do: {blocker['codexCanDo']}",
            f"- What Mako/Charlie can do: {blocker['humanCanDo']}",
            f"- Current next action: {blocker['nextAction']}",
            "",
        ])
    (version_dir / "missing-media-and-sync-notes.md").write_text("\n".join(lines), encoding="utf-8")


def default_blockers(
    episode: int,
    copied_shorts: list[dict[str, Any]],
    video_artifacts: list[dict[str, Any]],
    audio_artifacts: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    media_hint = EPISODE_MEDIA_HINTS.get(episode, "unknown")
    blockers: list[dict[str, Any]] = []
    if not video_artifacts:
        blockers.append(
            {
                "episode": episode,
                "area": "Long-form video v001",
                "what": "No long-form episode render exists in this version yet.",
                "blocks": "video export / long-form YouTube manual upload",
                "tried": "Versioned workspace created; existing proof shorts copied where available.",
                "codexCanDo": "Inspect session/export commands, sync lanes, and create first rough render when export path is ready.",
                "humanCanDo": f"Confirm media folder contents if asked: {media_hint}",
                "nextAction": "Create or verify long-form render path, then export v001 video without overwriting shorts.",
            }
        )
    if not audio_artifacts:
        blockers.append(
            {
                "episode": episode,
                "area": "Podcast audio v001",
                "what": "No audio-only podcast/RSS export exists in this version yet.",
                "blocks": "podcast/RSS manual upload",
                "tried": "Versioned workspace created; no audio-only file discovered for this version.",
                "codexCanDo": "Find/export mixed episode audio after session sync is trustworthy.",
                "humanCanDo": "Confirm preferred podcast audio source if multiple recordings exist.",
                "nextAction": "Add audio-only export command or produce a safe rough audio render.",
            }
        )
    if len(copied_shorts) < 5:
        blockers.append(
            {
                "episode": episode,
                "area": "Shorts v001",
                "what": f"Only {len(copied_shorts)} of 5 target shorts exist in this version.",
                "blocks": "social short manual upload",
                "tried": "Looked for existing five-short proof exports.",
                "codexCanDo": "Generate/export more short recipes if session media is available.",
                "humanCanDo": "Point to missing media or call out favorite moments if known.",
                "nextAction": "Export missing shorts or create an episode-specific gap report.",
            }
        )
    return blockers


def update_blocker_doc(all_blockers: list[dict[str, Any]], export_root: Path) -> None:
    lines = [
        "# Quipsly Episode Export Blockers",
        "",
        f"Last updated: {now_iso()}",
        "",
        f"Export workspace: `{export_root}`",
        "",
        "Use this while Charlie is away: if something here is easy for Mako or Charlie to answer, help with that item; otherwise Codex should continue with other episodes and revisit blockers later.",
        "",
    ]
    for blocker in all_blockers:
        lines.extend([
            f"## Episode {blocker['episode']:02d} - {blocker['area']}",
            "",
            f"- What is blocked: {blocker['what']}",
            f"- Blocks: {blocker['blocks']}",
            f"- What was tried: {blocker['tried']}",
            f"- What Codex can still do: {blocker['codexCanDo']}",
            f"- What Mako or Charlie can do: {blocker['humanCanDo']}",
            f"- Current next action: {blocker['nextAction']}",
            f"- Last updated: {now_iso()}",
            "",
        ])
    DESKTOP_BLOCKERS.write_text("\n".join(lines), encoding="utf-8")


def build_episode(export_root: Path, episode: int) -> dict[str, Any]:
    episode_dir = export_root / f"Episode_{episode:02d}"
    version_dir = episode_dir / "v001"
    shorts_dir = version_dir / "shorts"
    video_dir = version_dir / "video"
    audio_dir = version_dir / "audio"
    latest_dir = episode_dir / "latest"
    for path in (shorts_dir, video_dir, audio_dir, latest_dir):
        path.mkdir(parents=True, exist_ok=True)

    copied: list[dict[str, Any]] = []
    for index, src in enumerate(proof_short_paths(episode), start=1):
        dst = shorts_dir / f"episode-{episode:02d}-short-{index:02d}-v001.mp4"
        entry = safe_copy(src, dst)
        entry.update(probe_media(dst))
        copied.append(entry)

    video_artifacts = existing_media_artifacts(video_dir, {".mp4", ".mov", ".m4v"})
    audio_artifacts = existing_media_artifacts(audio_dir, {".m4a", ".mp3", ".aac", ".wav"})
    blockers = default_blockers(episode, copied, video_artifacts, audio_artifacts)
    manifest = {
        "packetType": "quipsly-versioned-episode-export-manifest",
        "version": "2026-06-23.v001.workspace.v1",
        "generatedAt": now_iso(),
        "episode": episode,
        "versionLabel": "v001",
        "sessionHint": SESSION_HINTS.get(episode),
        "exportRoot": str(export_root),
        "episodeFolder": str(episode_dir),
        "versionFolder": str(version_dir),
        "sourcePolicy": "copied derivative/proxy exports only; original media untouched",
        "shorts": copied,
        "video": video_artifacts,
        "audio": audio_artifacts,
        "blockers": blockers,
        "status": v001_status(copied, video_artifacts, audio_artifacts),
    }
    (version_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    write_episode_notes(episode, version_dir, copied, video_artifacts, audio_artifacts, blockers)
    write_missing_report(episode, version_dir, blockers)

    latest_readme = [
        f"# Episode {episode:02d} latest pointer",
        "",
        f"Current latest version: `v001`",
        f"Manifest: `{version_dir / 'manifest.json'}`",
        f"Notes: `{version_dir / 'notes.md'}`",
        "",
        "This pointer is informational. Prior versions must not be overwritten.",
        "",
    ]
    (latest_dir / "README.md").write_text("\n".join(latest_readme), encoding="utf-8")
    return manifest


def main() -> int:
    export_root = Path(os.environ.get("QUIPSLY_VERSIONED_EXPORT_ROOT", str(DEFAULT_EXPORT_ROOT))).expanduser()
    export_root.mkdir(parents=True, exist_ok=True)
    manifests = [build_episode(export_root, episode) for episode in range(1, 7)]
    all_blockers = [blocker for manifest in manifests for blocker in manifest["blockers"]]
    update_blocker_doc(all_blockers, export_root)
    summary = {
        "packetType": "quipsly-versioned-exports-workspace-summary",
        "version": "2026-06-23.v001.workspace-summary.v1",
        "generatedAt": now_iso(),
        "exportRoot": str(export_root),
        "desktopBlockerDocument": str(DESKTOP_BLOCKERS),
        "episodes": [
            {
                "episode": manifest["episode"],
                "status": manifest["status"],
                "shortCount": len(manifest["shorts"]),
                "videoCount": len(manifest["video"]),
                "audioCount": len(manifest["audio"]),
                "manifest": str(Path(manifest["versionFolder"]) / "manifest.json"),
            }
            for manifest in manifests
        ],
        "truth": "This summary records derivative/proxy proof exports, detected v001 video/audio artifacts, and gap reports. It claims video/audio only when files exist in the episode v001 folders.",
    }
    summary_path = export_root / "versioned-export-workspace-summary.json"
    summary_path.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
