#!/usr/bin/env python3
"""Inventory Quipsly episode media/export evidence across a local production root.

This is deliberately not an upload verifier. It scans episode folders and nearby
root-level artifacts to answer: what exists, what looks like source media, what
looks like rendered output, what has upload-sanity config/proof, and what is the
next safest action?

It does not upload, publish, schedule, mutate external accounts, or modify
original media.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

MEDIA_SUFFIXES = {".mp4", ".mov", ".m4v", ".insv", ".m4a", ".mp3", ".wav", ".aac"}
VIDEO_SUFFIXES = {".mp4", ".mov", ".m4v", ".insv"}
AUDIO_SUFFIXES = {".m4a", ".mp3", ".wav", ".aac"}
TEXT_SUFFIXES = {".srt", ".vtt", ".txt", ".md", ".json"}
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
ALL_SUFFIXES = MEDIA_SUFFIXES | TEXT_SUFFIXES | IMAGE_SUFFIXES


@dataclass
class InventoryFile:
    path: str
    kind: str
    sizeBytes: int
    sizeMB: float
    durationSeconds: float | None = None
    width: int | None = None
    height: int | None = None


@dataclass
class EpisodeInventory:
    episodeId: str
    title: str
    folder: str
    status: str
    nextAction: str
    sourceVideoCount: int = 0
    sourceAudioCount: int = 0
    renderedVideoCount: int = 0
    renderedAudioCount: int = 0
    shortCount: int = 0
    captionCount: int = 0
    thumbnailCount: int = 0
    uploadSanityConfigCount: int = 0
    uploadSanityReadyCount: int = 0
    uploadSanityBlockedCount: int = 0
    totalSizeGB: float = 0.0
    topFiles: list[InventoryFile] = field(default_factory=list)
    uploadProofs: list[str] = field(default_factory=list)


@dataclass
class InventoryReport:
    schema: str = "quipsly.episode-media-inventory.v1"
    createdAt: str = ""
    root: str = ""
    status: str = "not-run"
    episodeCount: int = 0
    uploadReadyCount: int = 0
    needsUploadPacketCount: int = 0
    sourceOnlyCount: int = 0
    totalSizeGB: float = 0.0
    episodes: list[EpisodeInventory] = field(default_factory=list)
    truth: dict[str, bool] = field(default_factory=dict)


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)


def ffprobe(path: Path) -> dict[str, Any]:
    result = run([
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type,width,height",
        "-of",
        "json",
        str(path),
    ])
    if result.returncode != 0:
        return {}
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return {}


def rel(root: Path, path: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def infer_episode_id(name: str) -> str | None:
    patterns = [
        r"episode[_\- ]?0*(\d+)(?:\b|_)",
        r"\bep[_\- ]?0*(\d+)(?:\b|_)",
    ]
    for pattern in patterns:
        match = re.search(pattern, name, re.I)
        if match:
            return f"episode-{int(match.group(1))}"
    return None


def episode_number(episode_id: str) -> int:
    match = re.search(r"(\d+)", episode_id)
    return int(match.group(1)) if match else 999


def classify(path: Path) -> str:
    suffix = path.suffix.lower()
    name = path.name.lower()
    if suffix in VIDEO_SUFFIXES:
        if "short" in name or "9x16" in name or "vertical" in name:
            return "short-video"
        if any(token in name for token in ["upload", "main", "tight", "render", "export", "final", "episode"]):
            return "rendered-video"
        return "source-video"
    if suffix in AUDIO_SUFFIXES:
        if any(token in name for token in ["podcast", "master", "spine", "render", "final", "upload"]):
            return "rendered-audio"
        return "source-audio"
    if suffix == ".json" and "upload_sanity_config" in name:
        return "upload-sanity-config"
    if suffix == ".json" and "upload_sanity" in name:
        return "upload-sanity-proof"
    if suffix in {".srt", ".vtt"}:
        return "caption"
    if suffix in IMAGE_SUFFIXES:
        if any(token in name for token in ["thumb", "thumbnail"]):
            return "thumbnail"
        return "image"
    return "support"


def walk_files(root: Path, max_depth: int) -> Iterable[Path]:
    base_depth = len(root.parts)
    for current, dirs, files in os.walk(root):
        current_path = Path(current)
        depth = len(current_path.parts) - base_depth
        if depth >= max_depth:
            dirs[:] = []
        for filename in files:
            path = current_path / filename
            if path.suffix.lower() in ALL_SUFFIXES:
                yield path


def discover_episode_dirs(root: Path) -> dict[str, Path]:
    found: dict[str, Path] = {}
    for child in root.iterdir() if root.exists() else []:
        if not child.is_dir():
            continue
        episode_id = infer_episode_id(child.name)
        if episode_id:
            found.setdefault(episode_id, child)
    return found


def compact_file(root: Path, path: Path, probe_media: bool) -> InventoryFile:
    stat = path.stat()
    item = InventoryFile(path=rel(root, path), kind=classify(path), sizeBytes=stat.st_size, sizeMB=round(stat.st_size / 1024 / 1024, 2))
    if probe_media and path.suffix.lower() in MEDIA_SUFFIXES and stat.st_size > 0:
        data = ffprobe(path)
        try:
            item.durationSeconds = round(float(data.get("format", {}).get("duration")), 3)
        except (TypeError, ValueError):
            pass
        for stream in data.get("streams", []):
            if stream.get("codec_type") == "video":
                item.width = stream.get("width")
                item.height = stream.get("height")
                break
    return item


def load_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text())
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def status_from_counts(ep: EpisodeInventory) -> tuple[str, str]:
    if ep.uploadSanityReadyCount > 0:
        return "upload-ready", "Upload manually if approved, then record receipts."
    if ep.uploadSanityBlockedCount > 0:
        return "upload-packet-blocked", "Fix upload sanity hard stops before publishing."
    if ep.uploadSanityConfigCount > 0:
        return "upload-sanity-config-needs-run", "Run upload sanity check and inspect result."
    if ep.renderedVideoCount and ep.renderedAudioCount and ep.captionCount:
        return "needs-upload-sanity-config", "Create upload sanity config for the rendered packet."
    if ep.renderedVideoCount or ep.renderedAudioCount or ep.shortCount:
        return "partial-renders-present", "Decide current-best render, add captions/metadata/config, then run sanity check."
    if ep.sourceVideoCount or ep.sourceAudioCount:
        return "source-media-present", "Build synced/audio-cleaned edit and render upload candidates."
    return "needs-media", "Add or locate source media before production work can continue."


def build_episode(root: Path, episode_id: str, folder: Path, files: list[Path], probe_media: bool) -> EpisodeInventory:
    compact = [compact_file(root, p, probe_media) for p in files]
    top = sorted(compact, key=lambda f: f.sizeBytes, reverse=True)[:12]
    ep = EpisodeInventory(
        episodeId=episode_id,
        title=folder.name.replace("_", " "),
        folder=str(folder),
        status="not-run",
        nextAction="",
        sourceVideoCount=sum(1 for f in compact if f.kind == "source-video"),
        sourceAudioCount=sum(1 for f in compact if f.kind == "source-audio"),
        renderedVideoCount=sum(1 for f in compact if f.kind == "rendered-video"),
        renderedAudioCount=sum(1 for f in compact if f.kind == "rendered-audio"),
        shortCount=sum(1 for f in compact if f.kind == "short-video"),
        captionCount=sum(1 for f in compact if f.kind == "caption"),
        thumbnailCount=sum(1 for f in compact if f.kind == "thumbnail"),
        uploadSanityConfigCount=sum(1 for f in compact if f.kind == "upload-sanity-config"),
        totalSizeGB=round(sum(f.sizeBytes for f in compact) / 1024 / 1024 / 1024, 3),
        topFiles=top,
    )
    for path in files:
        if classify(path) == "upload-sanity-proof":
            data = load_json(path)
            status = data.get("status")
            if status == "ready-to-upload":
                ep.uploadSanityReadyCount += 1
            elif status == "blocked":
                ep.uploadSanityBlockedCount += 1
            ep.uploadProofs.append(rel(root, path))
    ep.status, ep.nextAction = status_from_counts(ep)
    return ep


def markdown(report: InventoryReport) -> str:
    lines = [
        "# Quipsly episode media inventory",
        "",
        f"Created: `{report.createdAt}`",
        "",
        f"Root: `{report.root}`",
        "",
        f"Status: `{report.status}`",
        "",
        f"Episodes: `{report.episodeCount}`",
        f"Upload-ready: `{report.uploadReadyCount}`",
        f"Needs upload packet/config: `{report.needsUploadPacketCount}`",
        f"Source-only: `{report.sourceOnlyCount}`",
        f"Total scanned size: `{report.totalSizeGB}` GB",
        "",
        "## Overview",
        "",
        "| Episode | Status | Source V/A | Render V/A | Shorts | Captions | Configs | Next action |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ]
    for ep in report.episodes:
        lines.append(
            f"| `{ep.episodeId}` | `{ep.status}` | `{ep.sourceVideoCount}/{ep.sourceAudioCount}` | "
            f"`{ep.renderedVideoCount}/{ep.renderedAudioCount}` | `{ep.shortCount}` | `{ep.captionCount}` | "
            f"`{ep.uploadSanityConfigCount}` | {ep.nextAction} |"
        )
    lines.extend(["", "## Episode details", ""])
    for ep in report.episodes:
        lines.extend([
            f"### {ep.episodeId} - {ep.title}",
            "",
            f"- Status: `{ep.status}`",
            f"- Folder: `{ep.folder}`",
            f"- Next action: {ep.nextAction}",
            f"- Upload sanity proofs: `{len(ep.uploadProofs)}`",
            f"- Scanned size: `{ep.totalSizeGB}` GB",
            "",
            "Top files:",
            "",
        ])
        if ep.topFiles:
            for item in ep.topFiles[:8]:
                dur = f", {item.durationSeconds}s" if item.durationSeconds is not None else ""
                dims = f", {item.width}x{item.height}" if item.width and item.height else ""
                lines.append(f"- `{item.kind}` `{item.sizeMB}` MB{dur}{dims}: `{item.path}`")
        else:
            lines.append("- No recognized media/support files found.")
        lines.append("")
    lines.extend([
        "## Truth",
        "",
        "- This inventory does not upload, publish, schedule, or send anything externally.",
        "- This inventory does not mutate original media.",
        "- Counts are production-routing evidence, not publication receipts.",
    ])
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--max-depth", type=int, default=5)
    parser.add_argument("--probe-media", action="store_true")
    parser.add_argument("--output-stem", default="QUIPSLY_EPISODE_MEDIA_INVENTORY")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    root = args.root
    episode_dirs = discover_episode_dirs(root)
    grouped: dict[str, list[Path]] = {episode_id: [] for episode_id in episode_dirs}
    # Ensure the intended 1-6 board remains visible even if a folder is absent.
    for number in range(1, 7):
        grouped.setdefault(f"episode-{number}", [])
        episode_dirs.setdefault(f"episode-{number}", root / f"Episode_{number:02d}")

    for path in walk_files(root, args.max_depth):
        episode_id = infer_episode_id(str(path.relative_to(root)))
        if episode_id and episode_id in grouped:
            grouped[episode_id].append(path)

    episodes = [build_episode(root, episode_id, episode_dirs[episode_id], grouped.get(episode_id, []), args.probe_media) for episode_id in sorted(grouped, key=episode_number)]
    upload_ready = sum(1 for ep in episodes if ep.status == "upload-ready")
    needs_packet = sum(1 for ep in episodes if ep.status in {"needs-upload-sanity-config", "partial-renders-present", "upload-sanity-config-needs-run", "upload-packet-blocked"})
    source_only = sum(1 for ep in episodes if ep.status == "source-media-present")
    report = InventoryReport(
        createdAt=datetime.now(timezone.utc).isoformat(),
        root=str(root),
        status="inventory-ready",
        episodeCount=len(episodes),
        uploadReadyCount=upload_ready,
        needsUploadPacketCount=needs_packet,
        sourceOnlyCount=source_only,
        totalSizeGB=round(sum(ep.totalSizeGB for ep in episodes), 3),
        episodes=episodes,
        truth={
            "uploadedExternally": False,
            "publishedExternally": False,
            "scheduledExternally": False,
            "externalAccountsMutated": False,
            "originalMediaMutated": False,
        },
    )
    md_path = root / f"{args.output_stem}.md"
    json_path = root / f"{args.output_stem}.json"
    md_path.write_text(markdown(report), encoding="utf-8")
    json_path.write_text(json.dumps(asdict(report), indent=2), encoding="utf-8")
    if args.json:
        print(json.dumps({
            "status": report.status,
            "episodeCount": report.episodeCount,
            "uploadReadyCount": report.uploadReadyCount,
            "needsUploadPacketCount": report.needsUploadPacketCount,
            "sourceOnlyCount": report.sourceOnlyCount,
            "markdown": str(md_path),
            "json": str(json_path),
        }, indent=2))
    else:
        print(f"{report.status}: episodes={report.episodeCount} uploadReady={report.uploadReadyCount} needsPacket={report.needsUploadPacketCount}")
        print(md_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
