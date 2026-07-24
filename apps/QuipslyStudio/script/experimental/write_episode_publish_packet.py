#!/usr/bin/env python3
"""Write human-facing Quipsly episode publish packet files.

The native release manifests are operator-facing. This script writes the simple
folder contract Charlie/Mako need when manually publishing or reviewing:

- manifest.json
- notes.md
- sync-gap-report.md

It reads current artifact files and session JSON. It never renders media and
never mutates source media.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import urllib.parse
from datetime import datetime
from pathlib import Path
from typing import Any


FFPROBE_CANDIDATES = [
    "/opt/homebrew/bin/ffprobe",
    "/usr/local/bin/ffprobe",
    "ffprobe",
]


def now_local() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def ffprobe_path() -> str:
    for candidate in FFPROBE_CANDIDATES:
        if "/" not in candidate:
            return candidate
        if Path(candidate).exists():
            return candidate
    return "ffprobe"


def media_probe(path: Path) -> dict[str, Any]:
    base = {
        "path": str(path),
        "exists": path.exists(),
        "bytes": path.stat().st_size if path.exists() else 0,
        "durationSeconds": 0.0,
        "hasVideo": False,
        "hasAudio": False,
        "codecSummary": [],
    }
    if not path.exists() or base["bytes"] <= 0:
        return base

    try:
        output = subprocess.check_output(
            [
                ffprobe_path(),
                "-v",
                "error",
                "-show_entries",
                "format=duration,size:stream=codec_type,codec_name,width,height,sample_rate,channels",
                "-of",
                "json",
                str(path),
            ],
            text=True,
            stderr=subprocess.STDOUT,
            timeout=45,
        )
        payload = json.loads(output)
        fmt = payload.get("format") or {}
        base["durationSeconds"] = round(float(fmt.get("duration") or 0), 3)
        streams = payload.get("streams") or []
        for stream in streams:
            codec_type = stream.get("codec_type")
            codec_name = stream.get("codec_name") or "unknown"
            if codec_type == "video":
                base["hasVideo"] = True
                base["codecSummary"].append(
                    f"video:{codec_name}:{stream.get('width', '?')}x{stream.get('height', '?')}"
                )
            elif codec_type == "audio":
                base["hasAudio"] = True
                base["codecSummary"].append(
                    f"audio:{codec_name}:{stream.get('sample_rate', '?')}Hz:{stream.get('channels', '?')}ch"
                )
    except Exception as exc:  # keep packet generation resilient
        base["probeError"] = str(exc)
    return base


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    return payload if isinstance(payload, dict) else {}


def session_path(session_name: str) -> Path:
    return (
        Path.home()
        / "Library/Application Support/Quipsly/MediaVault/sessions"
        / f"{session_name}.quipsly-session.json"
    )


def artifact_from_manifest(version_dir: Path, kind: str) -> Path | None:
    manifest = version_dir / "latest-release-export-manifest.json"
    if not manifest.exists():
        return None
    try:
        payload = load_json(manifest)
    except Exception:
        return None
    for item in payload.get("outputFiles") or []:
        if isinstance(item, dict) and item.get("kind") == kind and item.get("path"):
            path = Path(str(item["path"]))
            if path.exists() and path.stat().st_size > 0:
                return path
    return None


def newest_existing(paths: list[Path]) -> Path | None:
    existing = [path for path in paths if path.exists() and path.stat().st_size > 0]
    if not existing:
        return None
    return max(existing, key=lambda path: path.stat().st_mtime)


def first_existing(paths: list[Path]) -> Path | None:
    for path in paths:
        if path.exists() and path.stat().st_size > 0:
            return path
    return None


def artifact_candidates(version_dir: Path, episode: int) -> dict[str, Path | None]:
    ep = f"{episode:02d}"
    video16 = first_existing([
        version_dir / "video" / f"episode-{ep}-v001-16x9.mp4",
    ]) or newest_existing([
        *(path for path in (version_dir / "video").glob("*16x9.mp4") if "proof" not in path.name),
        *version_dir.glob("*full-release-16x9.mp4"),
        *(path for path in version_dir.glob("*16x9.mp4") if "proof" not in path.name),
    ]) or artifact_from_manifest(version_dir, "episode-master")
    video9 = first_existing([
        version_dir / "video" / f"episode-{ep}-v001-9x16.mp4",
    ]) or newest_existing([
        *(path for path in (version_dir / "video").glob("*9x16.mp4") if "proof" not in path.name),
        *version_dir.glob("*full-release-9x16.mp4"),
        *(path for path in version_dir.glob("*9x16.mp4") if "short" not in path.name and "proof" not in path.name),
    ]) or artifact_from_manifest(version_dir, "vertical-master")
    audio = first_existing([
        version_dir / "audio" / f"episode-{ep}-v001-podcast-audio.m4a",
    ]) or newest_existing([
        *(version_dir / "audio").glob("*podcast-audio.m4a"),
        *version_dir.glob("*full-release-podcast-audio.m4a"),
        *version_dir.glob("*podcast-audio.m4a"),
    ]) or artifact_from_manifest(version_dir, "podcast-audio")
    return {
        "videoMaster16x9": video16,
        "videoMaster9x16": video9,
        "audioOnlyPodcast": audio,
    }


def short_candidates(version_dir: Path) -> list[Path]:
    shorts = sorted(path for path in (version_dir / "shorts").glob("*.mp4") if path.exists())
    if shorts:
        return shorts
    root_full = sorted(path for path in version_dir.glob("*full-release*9x16-short.mp4") if path.exists())
    if root_full:
        return root_full
    return sorted(path for path in version_dir.glob("*9x16-short.mp4") if path.exists())


def session_report(session_name: str) -> dict[str, Any]:
    path = session_path(session_name)
    if not path.exists():
        return {
            "sessionName": session_name,
            "sessionPath": str(path),
            "exists": False,
            "lanes": [],
            "gapSummary": ["Session file is missing; export artifacts may still be usable for review."],
        }

    payload = load_json(path)
    sequences = ((payload.get("project") or {}).get("sequences") or [])
    sequence = sequences[0] if sequences else {}
    lanes = []
    missing_proxy = []
    held = []
    for lane in sequence.get("lanes") or []:
        if not isinstance(lane, dict):
            continue
        metadata = lane.get("metadata") or {}
        source = lane.get("sourceVideo") or {}
        proxy_value = source.get("proxyURL") or ""
        if proxy_value.startswith("file://"):
            proxy_path = Path(urllib.parse.unquote(urllib.parse.urlparse(proxy_value).path))
        else:
            proxy_path = Path(proxy_value) if proxy_value else None
        proxy_exists = bool(proxy_path and proxy_path.exists() and proxy_path.stat().st_size > 0)
        lane_payload = {
            "name": lane.get("name") or "Unnamed lane",
            "mediaKind": metadata.get("mediaKind") or "unknown",
            "role": metadata.get("role") or "unknown",
            "ignoreForProduction": metadata.get("ignoreForProduction") is True,
            "durationSeconds": source.get("duration") or 0,
            "offsetSeconds": source.get("offset") or 0,
            "proxyPath": str(proxy_path) if proxy_path else "",
            "proxyExists": proxy_exists,
            "showCount": sum(1 for tag in lane.get("tags") or [] if isinstance(tag, dict) and tag.get("type") == "active"),
            "skipCount": sum(1 for tag in lane.get("tags") or [] if isinstance(tag, dict) and tag.get("type") in {"cut", "inactive"}),
        }
        lanes.append(lane_payload)
        if lane_payload["ignoreForProduction"]:
            held.append(lane_payload["name"])
        elif not proxy_exists:
            missing_proxy.append(lane_payload["name"])

    gap_summary = []
    if missing_proxy:
        gap_summary.append(f"{len(missing_proxy)} production lane(s) still lack a local non-empty proxy.")
    if held:
        gap_summary.append(f"{len(held)} lane(s) are held/recovery/context and excluded from current production export.")
    if not gap_summary:
        gap_summary.append("No blocking proxy gaps found in the current session report.")
    return {
        "sessionName": session_name,
        "sessionPath": str(path),
        "exists": True,
        "laneCount": len(lanes),
        "heldLaneCount": len(held),
        "missingProxyLaneCount": len(missing_proxy),
        "lanes": lanes,
        "gapSummary": gap_summary,
    }


def write_notes(version_dir: Path, episode: int, manifest: dict[str, Any], report: dict[str, Any]) -> None:
    lines = [
        f"# Episode {episode:02d} v001 manual-publish packet",
        "",
        f"Generated: {manifest['generatedAt']}",
        "",
        "## What exists",
    ]
    for key, label in [
        ("videoMaster16x9", "16:9 long-form video"),
        ("videoMaster9x16", "9:16 long-form vertical video"),
        ("audioOnlyPodcast", "Audio-only podcast/RSS file"),
    ]:
        item = manifest["artifacts"][key]
        if item["exists"]:
            lines.append(f"- {label}: `{Path(item['path']).name}` ({item['durationSeconds']}s, {item['bytes']} bytes).")
        else:
            lines.append(f"- {label}: missing.")
    lines.append(f"- 9:16 shorts: {len(manifest['shorts'])} file(s).")
    lines.extend([
        "",
        "## Review state",
        "",
        "- This is a local manual-publish packet, not publication receipt truth.",
        "- Watch/listen review is still required before posting.",
        "- Originals are untouched; these are proxy/session-derived derivative artifacts.",
    ])
    if manifest.get("warnings"):
        lines.extend(["", "## Warnings", ""])
        for warning in manifest["warnings"]:
            lines.append(f"- {warning}")
    lines.extend([
        "",
        "## Sync / gap report",
        "",
    ])
    for item in report["gapSummary"]:
        lines.append(f"- {item}")
    lines.extend([
        "",
        "## Next actions",
        "",
        "- Review long-form video and podcast audio for sync, dead air, missing visual coverage, and obvious crop issues.",
        "- Review each short as keep/refine/reject before manual upload.",
        "- After manual upload or scheduling, capture real platform URLs/provider IDs as publication receipts.",
    ])
    (version_dir / "notes.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_gap_report(version_dir: Path, report: dict[str, Any]) -> None:
    lines = [
        "# Sync gap report",
        "",
        f"Session: `{report['sessionName']}`",
        f"Session path: `{report['sessionPath']}`",
        "",
        "## Summary",
        "",
    ]
    for item in report["gapSummary"]:
        lines.append(f"- {item}")
    lines.extend(["", "## Lanes", ""])
    for lane in report.get("lanes") or []:
        status = "HELD" if lane["ignoreForProduction"] else "proxy-ready" if lane["proxyExists"] else "needs-proxy"
        lines.append(
            f"- `{status}` {lane['name']} | kind={lane['mediaKind']} | role={lane['role']} | "
            f"duration={lane['durationSeconds']}s | offset={lane['offsetSeconds']}s | "
            f"SHOW={lane['showCount']} | SKIP={lane['skipCount']}"
        )
    (version_dir / "sync-gap-report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Write Quipsly manual-publish manifest, notes, and gap report.")
    parser.add_argument("--episode", type=int, required=True)
    parser.add_argument("--version-dir", type=Path, required=True)
    parser.add_argument("--session", required=True)
    parser.add_argument("--min-long-seconds", type=float, default=600.0)
    args = parser.parse_args()

    version_dir = args.version_dir.expanduser()
    version_dir.mkdir(parents=True, exist_ok=True)

    artifacts = {
        name: media_probe(path) if path else {"path": "", "exists": False, "bytes": 0, "durationSeconds": 0, "hasVideo": False, "hasAudio": False, "codecSummary": []}
        for name, path in artifact_candidates(version_dir, args.episode).items()
    }
    shorts = [media_probe(path) | {"title": path.stem} for path in short_candidates(version_dir)]
    report = session_report(args.session)
    required_ready = all(artifacts[name]["exists"] for name in ["videoMaster16x9", "videoMaster9x16", "audioOnlyPodcast"])
    long_enough = all(
        float(artifacts[name].get("durationSeconds") or 0) >= args.min_long_seconds
        for name in ["videoMaster16x9", "videoMaster9x16", "audioOnlyPodcast"]
    )
    short_ready = len(shorts) >= 5
    warnings = []
    if required_ready and not long_enough:
        warnings.append(
            f"Long-form artifacts exist but one or more are shorter than {args.min_long_seconds:g}s; treat this as proof/smoke output, not a publishable episode master."
        )
    long_durations = [
        float(artifacts[name].get("durationSeconds") or 0)
        for name in ["videoMaster16x9", "videoMaster9x16", "audioOnlyPodcast"]
        if artifacts[name]["exists"]
    ]
    duration_spread = round(max(long_durations) - min(long_durations), 3) if long_durations else 0
    duration_alignment_ready = duration_spread <= 30.0
    if not required_ready:
        missing = [
            name
            for name in ["videoMaster16x9", "videoMaster9x16", "audioOnlyPodcast"]
            if not artifacts[name]["exists"]
        ]
        warnings.append(f"Missing required long-form artifact(s): {', '.join(missing)}.")
    if required_ready and not duration_alignment_ready:
        warnings.append(
            f"Long-form video/audio durations differ by {duration_spread}s; review whether this is intentional before publishing."
        )
    if not short_ready:
        warnings.append("Fewer than five 9:16 shorts exist in this version.")

    manifest = {
        "packetType": "quipsly-manual-publish-version-manifest",
        "version": "2026-06-24.v1",
        "generatedAt": now_local(),
        "episode": args.episode,
        "versionName": version_dir.name,
        "versionDir": str(version_dir),
        "session": {
            "name": args.session,
            "path": report["sessionPath"],
            "exists": report["exists"],
            "laneCount": report.get("laneCount", 0),
            "heldLaneCount": report.get("heldLaneCount", 0),
            "missingProxyLaneCount": report.get("missingProxyLaneCount", 0),
        },
        "status": "manual-review-ready" if required_ready and long_enough and short_ready else "needs-work",
        "artifacts": artifacts,
        "shorts": shorts,
        "shortCount": len(shorts),
        "minimumLongFormSeconds": args.min_long_seconds,
        "longFormDurationReady": long_enough,
        "longFormDurationSpreadSeconds": duration_spread,
        "longFormDurationAlignmentReady": duration_alignment_ready,
        "warnings": warnings,
        "sourcePolicy": "Whole synced sources stay intact; exports are derivatives from proxy/session metadata; original media is never mutated.",
        "publicationTruth": "Local export readiness is not publication completion. Capture real public URLs/provider IDs after manual publishing.",
        "gapSummary": report["gapSummary"],
    }

    (version_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    write_notes(version_dir, args.episode, manifest, report)
    write_gap_report(version_dir, report)
    print(json.dumps({
        "ok": True,
        "episode": args.episode,
        "status": manifest["status"],
        "versionDir": str(version_dir),
        "shortCount": len(shorts),
        "artifactsReady": required_ready,
        "longFormDurationReady": long_enough,
        "longFormDurationSpreadSeconds": duration_spread,
        "longFormDurationAlignmentReady": duration_alignment_ready,
        "warnings": warnings,
        "gapSummary": report["gapSummary"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
