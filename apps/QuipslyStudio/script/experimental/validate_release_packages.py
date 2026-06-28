#!/usr/bin/env python3
"""Validate current Quipsly episode release packages.

This script checks local artifact/package truth only. It does not render media,
publish externally, or mutate source media. It writes validation evidence beside
the review board so Charlie/Mako/Homer can see what is ready and what needs
attention.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
REQUIRED_PLATFORMS = {
    "YouTube",
    "Podcast/RSS",
    "YouTube Shorts",
    "Instagram",
    "Facebook",
    "LinkedIn",
    "Patreon",
    "HighGroundOdyssey.com",
}


def codec_video_dimensions(codec_summary: Any) -> tuple[int, int] | None:
    if not isinstance(codec_summary, list):
        return None
    for item in codec_summary:
        text = str(item)
        if not text.startswith("video:"):
            continue
        parts = text.split(":")
        if len(parts) < 3 or "x" not in parts[-1]:
            continue
        width_value, height_value = parts[-1].lower().split("x", 1)
        try:
            width = int(width_value)
            height = int(height_value)
        except ValueError:
            continue
        if width > 0 and height > 0:
            return width, height
    return None


def ffprobe_video_dimensions(path: Path | None) -> tuple[int, int] | None:
    if not path or not path.exists():
        return None
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=width,height",
                "-of",
                "json",
                str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
        payload = json.loads(result.stdout or "{}")
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError):
        return None

    for stream in payload.get("streams") or []:
        try:
            width = int(stream.get("width") or 0)
            height = int(stream.get("height") or 0)
        except (TypeError, ValueError):
            continue
        if width > 0 and height > 0:
            return width, height
    return None


def aspect_check(codec_summary: Any, expected: str, path: Path | None = None) -> dict[str, Any]:
    dimensions = codec_video_dimensions(codec_summary) or ffprobe_video_dimensions(path)
    if not dimensions:
        return {
            "expectedAspect": expected,
            "width": 0,
            "height": 0,
            "ratio": 0,
            "ok": False,
            "status": "missing-video-dimensions",
        }

    width, height = dimensions
    ratio = width / height
    target = 16 / 9 if expected == "16:9" else 9 / 16
    tolerance = 0.08
    ok = abs(ratio - target) <= tolerance
    return {
        "expectedAspect": expected,
        "width": width,
        "height": height,
        "ratio": round(ratio, 4),
        "ok": ok,
        "status": "aspect-ok" if ok else "aspect-mismatch",
    }


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    return payload if isinstance(payload, dict) else {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def check_file(path_value: str, label: str) -> dict[str, Any]:
    path = Path(path_value) if path_value else None
    exists = bool(path and path.exists())
    bytes_value = path.stat().st_size if exists else 0
    return {
        "label": label,
        "path": str(path) if path else "",
        "exists": exists,
        "bytes": bytes_value,
        "ok": exists and bytes_value > 0,
        "status": "ready" if exists and bytes_value > 0 else "missing-or-empty",
    }


def validate_episode(ep: dict[str, Any]) -> dict[str, Any]:
    blockers: list[str] = []
    warnings: list[str] = []
    checks: list[dict[str, Any]] = []

    version_dir = Path(ep.get("versionDir") or "")
    for label, path_value in [
        ("manifest", ep.get("manifestPath") or str(version_dir / "manifest.json")),
        ("notes", ep.get("notesPath") or str(version_dir / "notes.md")),
        ("sync-gap-report", ep.get("syncGapReportPath") or str(version_dir / "sync-gap-report.md")),
    ]:
        check = check_file(str(path_value), label)
        checks.append(check)
        if not check["ok"]:
            blockers.append(f"Missing {label}: {check['path']}")

    for key, artifact in (ep.get("artifacts") or {}).items():
        check = check_file(str(artifact.get("path") or ""), artifact.get("label") or key)
        expected_aspect = "9:16" if key == "longForm9x16" else "16:9"
        if key == "podcastAudio":
            expected_aspect = ""
        check.update({
            "durationSeconds": artifact.get("durationSeconds") or 0,
            "hasAudio": bool(artifact.get("hasAudio")),
            "hasVideo": bool(artifact.get("hasVideo")),
            "artifactStatus": artifact.get("status"),
            "codecSummary": artifact.get("codecSummary") or [],
            "aspectCheck": aspect_check(artifact.get("codecSummary") or [], expected_aspect, Path(check["path"])) if expected_aspect else {},
        })
        checks.append(check)
        if not check["ok"]:
            blockers.append(f"Missing artifact {check['label']}: {check['path']}")
        elif key == "podcastAudio" and not check["hasAudio"]:
            blockers.append("Podcast audio file exists but probe did not find audio.")
        elif key != "podcastAudio" and not check["hasVideo"]:
            blockers.append(f"Video artifact exists but probe did not find video: {check['label']}")
        elif key != "podcastAudio" and not check["aspectCheck"].get("ok"):
            blockers.append(
                f"{check['label']} has unexpected aspect/resolution: "
                f"{check['aspectCheck'].get('width')}x{check['aspectCheck'].get('height')} "
                f"expected {expected_aspect}."
            )

    shorts = ep.get("shorts") or []
    if len(shorts) < 5:
        blockers.append(f"Only {len(shorts)} short(s) found; minimum review target is 5.")
    ready_shorts = 0
    for short in shorts:
        check = check_file(str(short.get("path") or ""), f"short {short.get('index')}: {short.get('title')}")
        check.update({
            "durationSeconds": short.get("durationSeconds") or 0,
            "hasAudio": bool(short.get("hasAudio")),
            "hasVideo": bool(short.get("hasVideo")),
            "codecSummary": short.get("codecSummary") or [],
            "aspectCheck": aspect_check(short.get("codecSummary") or [], "9:16", Path(check["path"])),
        })
        if check["ok"] and check["hasAudio"] and check["hasVideo"] and check["aspectCheck"].get("ok"):
            ready_shorts += 1
        else:
            blockers.append(f"Short missing media/audio/video proof: {check['label']}")
    if ready_shorts < 5:
        blockers.append(f"Only {ready_shorts} short(s) have ready audio/video proof; minimum is 5.")

    ready_platforms = set((ep.get("platformPrep") or {}).get("readyPlatforms") or [])
    missing_platforms = sorted(REQUIRED_PLATFORMS - ready_platforms)
    if missing_platforms:
        warnings.append("Missing platform-prep evidence for: " + ", ".join(missing_platforms))

    episode_warnings = list(ep.get("warnings") or [])
    warnings.extend(episode_warnings)
    spread = ep.get("longFormDurationSpreadSeconds") or 0
    if not ep.get("longFormDurationAlignmentReady") and spread > 0.5:
        warnings.append(f"Long-form A/V duration spread needs human review: {spread}s")

    receipt_status = ep.get("publicationReceiptStatus") or "no platform receipts captured"
    if receipt_status != "no platform receipts captured":
        warnings.append(f"Review non-default receipt status before claiming publication: {receipt_status}")

    return {
        "episode": ep.get("episode"),
        "version": ep.get("version"),
        "versionDir": ep.get("versionDir"),
        "status": "blocked" if blockers else ("review-with-warnings" if warnings else "ready-for-human-review"),
        "blockers": blockers,
        "warnings": warnings,
        "checks": checks,
        "readyShortCount": ready_shorts,
        "shortCount": len(shorts),
        "readyPlatformCount": len(ready_platforms),
        "missingPlatforms": missing_platforms,
        "receiptStatus": receipt_status,
        "nextSafestAction": "Fix blockers before review." if blockers else ep.get("nextSafestAction"),
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Quipsly Release Package Validation",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "> Local package validation only. This does not publish or approve anything.",
        "",
        f"- Episodes checked: `{report['episodeCount']}`",
        f"- Blocked episodes: `{', '.join(map(str, report['blockedEpisodes'])) or 'none'}`",
        f"- Episodes with warnings: `{', '.join(map(str, report['warningEpisodes'])) or 'none'}`",
        "",
    ]
    for ep in report["episodes"]:
        lines.extend([
            f"## Episode {int(ep['episode']):02d} - {ep['version']}",
            "",
            f"- Status: `{ep['status']}`",
            f"- Ready shorts: `{ep['readyShortCount']}/{ep['shortCount']}`",
            f"- Platform prep: `{ep['readyPlatformCount']}/8`",
            f"- Receipt status: `{ep['receiptStatus']}`",
            f"- Next: {ep['nextSafestAction']}",
            "",
        ])
        if ep["blockers"]:
            lines.append("### Blockers")
            lines.extend(f"- {item}" for item in ep["blockers"])
            lines.append("")
        if ep["warnings"]:
            lines.append("### Warnings")
            lines.extend(f"- {item}" for item in ep["warnings"])
            lines.append("")
        if not ep["blockers"] and not ep["warnings"]:
            lines.append("- No blockers or warnings recorded by this validator.\n")
    return "\n".join(lines).rstrip() + "\n"


def update_release_status(root: Path, report: dict[str, Any], json_path: Path, md_path: Path) -> None:
    status_json_path = root / "release-status.json"
    status_payload = load_json(status_json_path) if status_json_path.exists() else {}
    status_payload["validation"] = {
        "generatedAt": report["generatedAt"],
        "jsonPath": str(json_path),
        "markdownPath": str(md_path),
        "blockedEpisodes": report["blockedEpisodes"],
        "warningEpisodes": report["warningEpisodes"],
        "truth": report["truth"],
    }
    write_json(status_json_path, status_payload)

    status_md_path = root / "release-status.md"
    if status_md_path.exists():
        marker = "\n## Latest validation\n"
        current = status_md_path.read_text(encoding="utf-8")
        base = current.split(marker)[0].rstrip()
        validation_lines = [
            "",
            "## Latest validation",
            "",
            f"- Generated: `{report['generatedAt']}`",
            f"- Blocked episodes: `{', '.join(map(str, report['blockedEpisodes'])) or 'none'}`",
            f"- Warning episodes: `{', '.join(map(str, report['warningEpisodes'])) or 'none'}`",
            f"- Validation JSON: `{json_path}`",
            f"- Validation notes: `{md_path}`",
            "- Truth: local validation only; not a publication receipt or approval.",
            "",
        ]
        status_md_path.write_text(base + "\n" + "\n".join(validation_lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate Quipsly local release packages.")
    parser.add_argument("root", nargs="?", type=Path, default=DEFAULT_ROOT)
    args = parser.parse_args()
    root = args.root.expanduser().resolve()
    board_path = root / "review-board" / "review-board.json"
    if not board_path.exists():
        raise SystemExit(f"Review board not found: {board_path}. Run build_release_review_board.py first.")
    board = load_json(board_path)
    episodes = [validate_episode(ep) for ep in board.get("episodes") or []]
    report = {
        "packetType": "quipsly-release-package-validation",
        "version": "2026-06-24.release-validation.v1",
        "generatedAt": iso_now(),
        "root": str(root),
        "episodeCount": len(episodes),
        "blockedEpisodes": [ep["episode"] for ep in episodes if ep["blockers"]],
        "warningEpisodes": [ep["episode"] for ep in episodes if ep["warnings"] and not ep["blockers"]],
        "truth": "Local package validation only. No upload, publication, approval, account change, or receipt claim occurred.",
        "episodes": episodes,
    }
    output_dir = root / "review-board"
    json_path = output_dir / "release-validation.json"
    md_path = output_dir / "release-validation.md"
    write_json(json_path, report)
    md_path.write_text(render_markdown(report), encoding="utf-8")
    update_release_status(root, report, json_path, md_path)
    print(json.dumps({
        "ok": not report["blockedEpisodes"],
        "jsonPath": str(json_path),
        "markdownPath": str(md_path),
        "blockedEpisodes": report["blockedEpisodes"],
        "warningEpisodes": report["warningEpisodes"],
        "truth": report["truth"],
    }, indent=2, sort_keys=True))
    return 0 if not report["blockedEpisodes"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
