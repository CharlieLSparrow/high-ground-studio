#!/usr/bin/env python3
"""Build a Quipsly upload readiness board across episode export folders.

The board discovers upload sanity config JSON files, optionally refreshes their
sanity checks, and summarizes readiness in one Markdown/JSON artifact. It also
surfaces obvious episode folders that do not yet have an upload-sanity config so
future work routes cleanly instead of becoming artifact archaeology.

This script does not upload, publish, schedule, mutate external accounts, or
modify original media. It only writes local readback artifacts.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass
class BoardEntry:
    episodeId: str
    title: str
    status: str
    readyDir: str
    configPath: str = ""
    sanityMarkdown: str = ""
    sanityJson: str = ""
    hardStopCount: int = 0
    warningCount: int = 0
    recommendation: str = ""
    youtubeVideo: str = ""
    podcastAudio: str = ""
    captions: str = ""
    thumbnail: str = ""
    nextAction: str = ""
    truth: dict[str, Any] = field(default_factory=dict)


@dataclass
class ReadinessBoard:
    schema: str = "quipsly.upload-readiness-board.v1"
    createdAt: str = ""
    status: str = "not-run"
    root: str = ""
    configuredCount: int = 0
    readyCount: int = 0
    blockedCount: int = 0
    warningCount: int = 0
    needsConfigCount: int = 0
    entries: list[BoardEntry] = field(default_factory=list)
    truth: dict[str, Any] = field(default_factory=dict)


def load_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        return {"status": "json-parse-failed", "error": str(exc), "path": str(path)}
    return data if isinstance(data, dict) else {"status": "unexpected-json-root", "path": str(path)}


def run(cmd: list[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=str(cwd), check=False)


def rel(root: Path, path: Path | str) -> str:
    p = Path(path)
    try:
        return str(p.relative_to(root))
    except ValueError:
        return str(p)


def label_from_dir(path: Path) -> str:
    name = path.name.replace("_", " ").replace("-", " ").strip()
    match = re.search(r"episode\s*0*(\d+)", name, re.I)
    if match:
        return f"episode-{int(match.group(1))}"
    return name.lower().replace(" ", "-") or "unknown"


def discover_episode_dirs(root: Path) -> list[Path]:
    dirs: list[Path] = []
    if not root.exists():
        return dirs
    for child in root.iterdir():
        if child.is_dir() and re.match(r"Episode[_ -]?0?\d+\b", child.name, re.I):
            dirs.append(child)
    return sorted(dirs)


def config_output_paths(config: dict[str, Any], config_path: Path) -> tuple[Path | None, Path | None]:
    ready_dir_value = config.get("ready_dir") or config.get("readyDir")
    output_stem = config.get("output_stem") or config.get("outputStem") or "UPLOAD_SANITY_CHECK"
    if not ready_dir_value:
        return None, None
    ready_dir = Path(ready_dir_value)
    return ready_dir / f"{output_stem}.md", ready_dir / f"{output_stem}.json"


def run_sanity(script: Path, config_path: Path, cwd: Path) -> tuple[Path | None, Path | None, str]:
    result = run(["python3", str(script), "--config", str(config_path), "--json"], cwd=cwd)
    if result.returncode != 0:
        return None, None, (result.stderr.strip() or result.stdout.strip() or "sanity check failed")
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        return None, None, f"sanity check returned non-json output: {result.stdout[:400]}"
    return Path(payload.get("markdown", "")), Path(payload.get("json", "")), ""


def first_file(report: dict[str, Any], label: str) -> str:
    for item in report.get("files", []):
        if item.get("label") == label:
            return item.get("path", "")
    return ""


def entry_from_config(root: Path, config_path: Path, report_path: Path | None, error: str = "") -> BoardEntry:
    config = load_json(config_path)
    ready_dir = Path(config.get("ready_dir") or config.get("readyDir") or config_path.parent)
    report = load_json(report_path) if report_path and report_path.exists() else {}
    status = report.get("status") or ("blocked" if error else "not-run")
    hard_stops = int(report.get("hardStopCount") or 0)
    warnings = int(report.get("warningCount") or 0)
    recommendation = report.get("producerRecommendation") or config.get("recommendation") or "Run upload sanity check."
    md_path, json_path = config_output_paths(config, config_path)
    if error:
        status = "blocked"
        hard_stops = max(hard_stops, 1)
        recommendation = f"Fix upload sanity check error: {error}"
    if status == "ready-to-upload":
        next_action = "Human can upload manually, then record receipts."
    elif status == "blocked":
        next_action = "Fix hard stops before upload."
    else:
        next_action = "Run upload sanity check."
    return BoardEntry(
        episodeId=report.get("episodeId") or config.get("episode_id") or config.get("episodeId") or label_from_dir(ready_dir),
        title=report.get("title") or config.get("title") or ready_dir.name,
        status=status,
        readyDir=str(ready_dir),
        configPath=rel(root, config_path),
        sanityMarkdown=rel(root, md_path) if md_path else "",
        sanityJson=rel(root, json_path) if json_path else "",
        hardStopCount=hard_stops,
        warningCount=warnings,
        recommendation=recommendation,
        youtubeVideo=first_file(report, "youtube_video") or config.get("youtube_video") or config.get("youtubeVideo") or "",
        podcastAudio=first_file(report, "podcast_audio") or config.get("podcast_audio") or config.get("podcastAudio") or "",
        captions=first_file(report, "captions") or config.get("captions") or "",
        thumbnail=first_file(report, "thumbnail") or config.get("thumbnail") or "",
        nextAction=next_action,
        truth=report.get("truth") or {},
    )


def missing_entry(root: Path, path: Path) -> BoardEntry:
    episode_id = label_from_dir(path)
    return BoardEntry(
        episodeId=episode_id,
        title=path.name.replace("_", " "),
        status="needs-upload-sanity-config",
        readyDir=str(path),
        nextAction="Create/render an upload packet, then add an upload sanity config for this episode.",
        recommendation="Not upload-ready yet; no upload sanity config found.",
        truth={
            "uploadedExternally": False,
            "publishedExternally": False,
            "originalMediaMutated": False,
        },
    )


def build_markdown(board: ReadinessBoard) -> str:
    lines: list[str] = [
        "# Quipsly upload readiness board",
        "",
        f"Created: `{board.createdAt}`",
        "",
        f"Root: `{board.root}`",
        "",
        f"Status: `{board.status}`",
        "",
        f"Configured packets: `{board.configuredCount}`",
        f"Ready packets: `{board.readyCount}`",
        f"Blocked packets: `{board.blockedCount}`",
        f"Needs config: `{board.needsConfigCount}`",
        "",
        "## Episode overview",
        "",
        "| Episode | Status | Hard stops | Warnings | Next action |",
        "| --- | --- | ---: | ---: | --- |",
    ]
    for entry in board.entries:
        lines.append(
            f"| `{entry.episodeId}` | `{entry.status}` | `{entry.hardStopCount}` | "
            f"`{entry.warningCount}` | {entry.nextAction} |"
        )
    lines.extend(["", "## Details", ""])
    for entry in board.entries:
        lines.extend([
            f"### {entry.title}",
            "",
            f"- Episode id: `{entry.episodeId}`",
            f"- Status: `{entry.status}`",
            f"- Ready dir: `{entry.readyDir}`",
            f"- Recommendation: {entry.recommendation}",
            f"- Config: `{entry.configPath or 'missing'}`",
            f"- Sanity Markdown: `{entry.sanityMarkdown or 'missing'}`",
            f"- YouTube video: `{entry.youtubeVideo or 'missing'}`",
            f"- Podcast audio: `{entry.podcastAudio or 'missing'}`",
            f"- Captions: `{entry.captions or 'missing'}`",
            f"- Thumbnail: `{entry.thumbnail or 'missing'}`",
            "",
        ])
    lines.extend([
        "## Truth",
        "",
        "- This board does not upload, publish, schedule, or send anything externally.",
        "- This board does not mutate original media.",
        "- `ready-to-upload` means local artifact readiness only.",
        "- External publication becomes true only after receipt URLs or provider IDs are captured.",
    ])
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--output-stem", default="QUIPSLY_UPLOAD_READINESS_BOARD")
    parser.add_argument("--run-sanity", action="store_true")
    parser.add_argument("--sanity-script", type=Path, default=Path("apps/QuipslyStudio/script/quipsly_upload_sanity_check.py"))
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    root = args.root
    output_dir = args.output_dir or root
    output_dir.mkdir(parents=True, exist_ok=True)
    cwd = Path.cwd()
    sanity_script = args.sanity_script
    config_paths = sorted(root.rglob("*UPLOAD_SANITY_CONFIG*.json"))
    configured_ready_dirs: set[Path] = set()
    entries: list[BoardEntry] = []
    for config_path in config_paths:
        config = load_json(config_path)
        ready_dir_value = config.get("ready_dir") or config.get("readyDir")
        if ready_dir_value:
            configured_ready_dirs.add(Path(ready_dir_value).resolve())
        md_path, json_path = config_output_paths(config, config_path)
        error = ""
        if args.run_sanity:
            md_path, json_path, error = run_sanity(sanity_script, config_path, cwd)
        entries.append(entry_from_config(root, config_path, json_path, error))

    for episode_dir in discover_episode_dirs(root):
        if episode_dir.resolve() not in configured_ready_dirs:
            entries.append(missing_entry(root, episode_dir))

    order = {"ready-to-upload": 0, "blocked": 1, "not-run": 2, "needs-upload-sanity-config": 3}
    entries.sort(key=lambda e: (order.get(e.status, 9), e.episodeId, e.title))
    ready_count = sum(1 for e in entries if e.status == "ready-to-upload")
    blocked_count = sum(1 for e in entries if e.status == "blocked")
    needs_config_count = sum(1 for e in entries if e.status == "needs-upload-sanity-config")
    warning_count = sum(e.warningCount for e in entries)
    board = ReadinessBoard(
        createdAt=datetime.now(timezone.utc).isoformat(),
        status="ready-with-gaps" if ready_count and needs_config_count else ("all-configured-ready" if ready_count and not blocked_count else "needs-attention"),
        root=str(root),
        configuredCount=len(config_paths),
        readyCount=ready_count,
        blockedCount=blocked_count,
        warningCount=warning_count,
        needsConfigCount=needs_config_count,
        entries=entries,
        truth={
            "uploadedExternally": False,
            "publishedExternally": False,
            "scheduledExternally": False,
            "externalAccountsMutated": False,
            "originalMediaMutated": False,
        },
    )
    md_path = output_dir / f"{args.output_stem}.md"
    json_path = output_dir / f"{args.output_stem}.json"
    md_path.write_text(build_markdown(board), encoding="utf-8")
    json_path.write_text(json.dumps(asdict(board), indent=2), encoding="utf-8")
    if args.json:
        print(json.dumps({"status": board.status, "configuredCount": board.configuredCount, "readyCount": board.readyCount, "blockedCount": board.blockedCount, "needsConfigCount": board.needsConfigCount, "markdown": str(md_path), "json": str(json_path)}, indent=2))
    else:
        print(f"{board.status}: ready={board.readyCount} blocked={board.blockedCount} needsConfig={board.needsConfigCount}")
        print(md_path)
    return 0 if blocked_count == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
