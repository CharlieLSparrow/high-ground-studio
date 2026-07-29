#!/usr/bin/env python3
"""Create Quipsly upload-packet workorders for episodes that are not yet ready.

This tool turns the media inventory/readiness gap into concrete production
routing. It finds likely long-form video, podcast audio, captions, thumbnails,
and shorts candidates, then writes per-episode workorders and a summary board.
It deliberately does not create upload-sanity configs or mark an episode ready;
that requires an intentional producer/config pass plus the upload sanity check.

No upload, publication, scheduling, account mutation, source-media mutation, or
receipt creation is performed.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

VIDEO_SUFFIXES = {".mp4", ".mov", ".m4v"}
AUDIO_SUFFIXES = {".m4a", ".mp3", ".wav", ".aac"}
CAPTION_SUFFIXES = {".srt", ".vtt"}
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


@dataclass
class Candidate:
    path: str
    sizeMB: float
    score: int
    reason: str


@dataclass
class EpisodeWorkorder:
    episodeId: str
    status: str
    sourceStatus: str
    nextAction: str
    longFormVideoCandidates: list[Candidate] = field(default_factory=list)
    podcastAudioCandidates: list[Candidate] = field(default_factory=list)
    captionCandidates: list[Candidate] = field(default_factory=list)
    thumbnailCandidates: list[Candidate] = field(default_factory=list)
    shortCandidates: list[Candidate] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)
    cautions: list[str] = field(default_factory=list)
    workorderMarkdown: str = ""


@dataclass
class WorkorderBoard:
    schema: str = "quipsly.upload-packet-workorders.v1"
    createdAt: str = ""
    root: str = ""
    status: str = "not-run"
    episodeCount: int = 0
    workorderCount: int = 0
    readyElsewhereCount: int = 0
    episodes: list[EpisodeWorkorder] = field(default_factory=list)
    truth: dict[str, bool] = field(default_factory=dict)


def rel(root: Path, path: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def infer_episode_id(value: str) -> str | None:
    for pattern in [r"episode[_\- ]?0*(\d+)(?:\b|_)", r"\bep[_\- ]?0*(\d+)(?:\b|_)"]:
        match = re.search(pattern, value, re.I)
        if match:
            return f"episode-{int(match.group(1))}"
    return None


def episode_number(episode_id: str) -> int:
    match = re.search(r"(\d+)", episode_id)
    return int(match.group(1)) if match else 999


def safe_name(episode_id: str) -> str:
    return episode_id.replace("/", "-").replace(" ", "-")


def score_video(root: Path, path: Path) -> tuple[int, str, bool]:
    name = path.name.lower()
    parts = rel(root, path).lower()
    score = 0
    reasons: list[str] = []
    is_long = True
    if "16x9" in name or "16x9" in parts:
        score += 50; reasons.append("16x9")
    if "9x16" in name or "short" in name or "shorts" in parts or "vertical" in name:
        score -= 80; is_long = False; reasons.append("vertical/short signal")
    if "full-release" in name or "main" in name or "release" in parts:
        score += 30; reasons.append("release/main signal")
    if "duration-candidate" in name:
        score += 12; reasons.append("duration candidate")
    if "warning" in parts or "derivatives" in parts:
        score -= 35; reasons.append("review/derivative caution")
    return score, ", ".join(reasons) or "video candidate", is_long


def score_audio(root: Path, path: Path) -> tuple[int, str]:
    name = path.name.lower()
    parts = rel(root, path).lower()
    score = 0
    reasons: list[str] = []
    if path.suffix.lower() == ".m4a":
        score += 20; reasons.append("M4A")
    if "podcast" in name or "podcast" in parts:
        score += 50; reasons.append("podcast signal")
    if "full-release" in name or "release" in parts:
        score += 20; reasons.append("release signal")
    if "master" in name or "spine" in name:
        score += 10; reasons.append("master/spine signal")
    if "source" in name or "orig" in name:
        score -= 40; reasons.append("source/original caution")
    return score, ", ".join(reasons) or "audio candidate"


def score_caption(root: Path, path: Path) -> tuple[int, str]:
    name = path.name.lower()
    parts = rel(root, path).lower()
    score = 0
    reasons: list[str] = []
    if "upload-safe" in name or "upload-safe" in parts:
        score += 60; reasons.append("upload-safe")
    if "main" in name or "full" in name or "long" in name:
        score += 20; reasons.append("long-form signal")
    if "short" in name or "shorts" in parts:
        score -= 40; reasons.append("short-caption caution")
    return score, ", ".join(reasons) or "caption candidate"


def score_thumbnail(path: Path) -> tuple[int, str]:
    name = path.name.lower()
    score = 0
    reasons: list[str] = []
    if "thumb" in name or "thumbnail" in name:
        score += 60; reasons.append("thumbnail signal")
    if "recommended" in name:
        score += 30; reasons.append("recommended")
    return score, ", ".join(reasons) or "image candidate"


def add_candidate(root: Path, path: Path, score: int, reason: str) -> Candidate:
    size = path.stat().st_size if path.exists() else 0
    return Candidate(path=rel(root, path), sizeMB=round(size / 1024 / 1024, 2), score=score, reason=reason)


def scan(root: Path, max_depth: int) -> dict[str, dict[str, list[Candidate]]]:
    grouped: dict[str, dict[str, list[Candidate]]] = {f"episode-{i}": {"video": [], "audio": [], "caption": [], "thumbnail": [], "short": []} for i in range(1, 7)}
    base_depth = len(root.parts)
    for current, dirs, files in os.walk(root):
        current_path = Path(current)
        depth = len(current_path.parts) - base_depth
        if depth >= max_depth:
            dirs[:] = []
        for filename in files:
            path = current_path / filename
            episode_id = infer_episode_id(str(path.relative_to(root)))
            if episode_id not in grouped:
                continue
            suffix = path.suffix.lower()
            if suffix in VIDEO_SUFFIXES:
                score, reason, is_long = score_video(root, path)
                bucket = "video" if is_long else "short"
                grouped[episode_id][bucket].append(add_candidate(root, path, score, reason))
            elif suffix in AUDIO_SUFFIXES:
                score, reason = score_audio(root, path)
                grouped[episode_id]["audio"].append(add_candidate(root, path, score, reason))
            elif suffix in CAPTION_SUFFIXES:
                score, reason = score_caption(root, path)
                grouped[episode_id]["caption"].append(add_candidate(root, path, score, reason))
            elif suffix in IMAGE_SUFFIXES:
                score, reason = score_thumbnail(path)
                if score > 0:
                    grouped[episode_id]["thumbnail"].append(add_candidate(root, path, score, reason))
    for buckets in grouped.values():
        for values in buckets.values():
            values.sort(key=lambda c: (c.score, c.sizeMB), reverse=True)
    return grouped


def load_readiness(path: Path | None) -> dict[str, str]:
    if path is None or not path.exists():
        return {}
    try:
        data = json.loads(path.read_text())
    except Exception:
        return {}
    statuses: dict[str, str] = {}
    for entry in data.get("entries", []):
        episode_id = entry.get("episodeId")
        status = entry.get("status")
        if episode_id and status:
            if statuses.get(episode_id) == "ready-to-upload":
                continue
            statuses[episode_id] = status
    return statuses


def derive_status(episode_id: str, buckets: dict[str, list[Candidate]], readiness: dict[str, str]) -> tuple[str, list[str], list[str], str]:
    if readiness.get(episode_id) == "ready-to-upload":
        return "already-upload-ready", [], [], "Use existing upload-ready packet and record receipts after manual publication."
    missing: list[str] = []
    cautions: list[str] = []
    if not buckets["video"]:
        missing.append("long-form 16x9 video candidate")
    if not buckets["audio"]:
        missing.append("podcast audio candidate")
    if not any(candidate.score >= 10 for candidate in buckets["caption"]):
        missing.append("long-form/upload-safe caption candidate")
        if buckets["caption"]:
            cautions.append("caption files exist, but top candidates look short-specific or unverified")
    if not buckets["thumbnail"]:
        missing.append("thumbnail candidate")
    if not buckets["short"]:
        cautions.append("no social short candidates found")
    if missing:
        return "needs-producer-assets", missing, cautions, "Create or locate missing upload-packet assets before writing an upload sanity config."
    return "ready-for-producer-config-choice", missing, cautions, "Choose candidates, create upload sanity config, run sanity verifier, then promote only if it passes."


def write_episode_md(path: Path, work: EpisodeWorkorder) -> None:
    lines: list[str] = [
        f"# {work.episodeId} upload-packet workorder",
        "",
        f"Status: `{work.status}`",
        "",
        f"Next action: {work.nextAction}",
        "",
        "## Missing",
        "",
    ]
    lines.extend([f"- {item}" for item in work.missing] or ["- None"])
    lines.extend(["", "## Cautions", ""])
    lines.extend([f"- {item}" for item in work.cautions] or ["- None"])
    sections = [
        ("Long-form video candidates", work.longFormVideoCandidates),
        ("Podcast audio candidates", work.podcastAudioCandidates),
        ("Caption candidates", work.captionCandidates),
        ("Thumbnail candidates", work.thumbnailCandidates),
        ("Short candidates", work.shortCandidates),
    ]
    for title, candidates in sections:
        lines.extend(["", f"## {title}", ""])
        if not candidates:
            lines.append("- None found")
            continue
        for candidate in candidates[:8]:
            lines.append(f"- score `{candidate.score}`, `{candidate.sizeMB}` MB, {candidate.reason}: `{candidate.path}`")
    lines.extend([
        "",
        "## Truth",
        "",
        "- This workorder does not make the episode upload-ready.",
        "- It does not upload, publish, schedule, mutate source media, or create receipts.",
        "- Promotion requires an intentional upload sanity config plus a passing sanity verifier run.",
    ])
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def board_markdown(board: WorkorderBoard) -> str:
    lines: list[str] = [
        "# Quipsly upload-packet workorders",
        "",
        f"Created: `{board.createdAt}`",
        "",
        f"Root: `{board.root}`",
        "",
        f"Status: `{board.status}`",
        "",
        f"Workorders: `{board.workorderCount}`",
        f"Already upload-ready elsewhere: `{board.readyElsewhereCount}`",
        "",
        "## Overview",
        "",
        "| Episode | Status | Missing | Next action | Workorder |",
        "| --- | --- | --- | --- | --- |",
    ]
    for work in board.episodes:
        missing = ", ".join(work.missing) if work.missing else "none"
        lines.append(f"| `{work.episodeId}` | `{work.status}` | {missing} | {work.nextAction} | `{work.workorderMarkdown}` |")
    lines.extend([
        "",
        "## Truth",
        "",
        "- This board creates production workorders only.",
        "- It does not upload, publish, schedule, mutate source media, or create receipts.",
        "- Workorders are candidate-routing evidence, not upload readiness proof.",
    ])
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--readiness-board", type=Path)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--max-depth", type=int, default=6)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    root = args.root
    output_dir = args.output_dir or root / "upload-packet-workorders"
    output_dir.mkdir(parents=True, exist_ok=True)
    readiness = load_readiness(args.readiness_board or root / "QUIPSLY_UPLOAD_READINESS_BOARD.json")
    grouped = scan(root, args.max_depth)
    works: list[EpisodeWorkorder] = []
    ready_elsewhere = 0
    for episode_id in sorted(grouped, key=episode_number):
        buckets = grouped[episode_id]
        status, missing, cautions, next_action = derive_status(episode_id, buckets, readiness)
        if status == "already-upload-ready":
            ready_elsewhere += 1
        work = EpisodeWorkorder(
            episodeId=episode_id,
            status=status,
            sourceStatus=readiness.get(episode_id, "not-upload-ready"),
            nextAction=next_action,
            longFormVideoCandidates=buckets["video"][:8],
            podcastAudioCandidates=buckets["audio"][:8],
            captionCandidates=buckets["caption"][:8],
            thumbnailCandidates=buckets["thumbnail"][:8],
            shortCandidates=buckets["short"][:8],
            missing=missing,
            cautions=cautions,
        )
        md_path = output_dir / f"{safe_name(episode_id)}-upload-packet-workorder.md"
        write_episode_md(md_path, work)
        work.workorderMarkdown = rel(root, md_path)
        works.append(work)
    board = WorkorderBoard(
        createdAt=datetime.now(timezone.utc).isoformat(),
        root=str(root),
        status="workorders-ready",
        episodeCount=len(works),
        workorderCount=sum(1 for w in works if w.status != "already-upload-ready"),
        readyElsewhereCount=ready_elsewhere,
        episodes=works,
        truth={
            "uploadedExternally": False,
            "publishedExternally": False,
            "scheduledExternally": False,
            "externalAccountsMutated": False,
            "originalMediaMutated": False,
        },
    )
    md = output_dir / "QUIPSLY_UPLOAD_PACKET_WORKORDERS.md"
    js = output_dir / "QUIPSLY_UPLOAD_PACKET_WORKORDERS.json"
    md.write_text(board_markdown(board), encoding="utf-8")
    js.write_text(json.dumps(asdict(board), indent=2), encoding="utf-8")
    if args.json:
        print(json.dumps({
            "status": board.status,
            "episodeCount": board.episodeCount,
            "workorderCount": board.workorderCount,
            "readyElsewhereCount": board.readyElsewhereCount,
            "markdown": str(md),
            "json": str(js),
        }, indent=2))
    else:
        print(f"{board.status}: workorders={board.workorderCount} readyElsewhere={board.readyElsewhereCount}")
        print(md)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
