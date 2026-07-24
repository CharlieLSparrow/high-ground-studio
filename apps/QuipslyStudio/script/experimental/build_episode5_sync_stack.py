#!/usr/bin/env python3
"""Build a first-pass native Quipsly Studio sync-stack session for Episode 5.

This creates Quipsly metadata over intact sources. It does not copy, trim,
transcode, delete, or mutate the original media.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

APP_NAMESPACE = uuid.UUID("4c843490-4b67-4cd8-891b-000000000005")
SESSION_NAME = "episode-5-sync-stack-v1"
DEFAULT_ROOT = Path("/Volumes/My Passport/Episode 5")
DEFAULT_SESSION_DIR = Path.home() / "Library/Application Support/Quipsly/MediaVault/sessions"
DEFAULT_REPORT_DIR = Path("reports")
DEFAULT_CURRENT_STATE_DIR = Path("../../docs/quipsly/current-state")
DEFAULT_VAULT_ROOT = Path.home() / "Library/Application Support/Quipsly/MediaVault"

FNV_OFFSET = 0xCBF29CE484222325
FNV_PRIME = 0x100000001B3
AUDIO_EXTENSIONS = {".wav", ".aif", ".aiff", ".mp3", ".m4a", ".aac", ".flac"}


def stable_uuid(label: str) -> str:
    return str(uuid.uuid5(APP_NAMESPACE, label)).upper()


def fnv1a64_hex(value: str) -> str:
    h = FNV_OFFSET
    for byte in value.encode("utf-8"):
        h ^= byte
        h = (h * FNV_PRIME) & 0xFFFFFFFFFFFFFFFF
    return f"{h:016x}"


def safe_filename(value: str) -> str:
    allowed = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._- "
    cleaned = "".join(ch if ch in allowed else "-" for ch in value).replace(" ", "_")
    while "__" in cleaned:
        cleaned = cleaned.replace("__", "_")
    return cleaned or "asset"


def file_uri(path: Path) -> str:
    return "file://" + quote(str(path), safe="/:")


def expected_proxy_path(path: Path, vault_root: Path) -> Path:
    asset_id = fnv1a64_hex(str(path.resolve(strict=False)))
    ext = "m4a" if path.suffix.lower() in AUDIO_EXTENSIONS else "mp4"
    safe_base = safe_filename(path.stem or asset_id)
    return vault_root / "proxy" / asset_id / f"{safe_base}_proxy.{ext}"


def probe(path: Path) -> dict:
    ffprobe = "/opt/homebrew/bin/ffprobe"
    if not Path(ffprobe).exists():
        ffprobe = "ffprobe"
    cmd = [
        ffprobe,
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    try:
        data = json.loads(subprocess.check_output(cmd, text=True, timeout=60, stderr=subprocess.STDOUT) or "{}")
    except Exception as error:
        return {
            "path": str(path),
            "file": path.name,
            "exists": path.exists(),
            "duration": 0.0,
            "probeError": str(error),
            "videoStreams": 0,
            "audioStreams": 0,
            "creationTime": "",
        }

    fmt = data.get("format") or {}
    streams = data.get("streams") or []
    video = [stream for stream in streams if stream.get("codec_type") == "video"]
    audio = [stream for stream in streams if stream.get("codec_type") == "audio"]
    creation_time = (fmt.get("tags") or {}).get("creation_time") or ""
    if not creation_time:
        for stream in streams:
            creation_time = (stream.get("tags") or {}).get("creation_time") or ""
            if creation_time:
                break

    return {
        "path": str(path),
        "file": path.name,
        "exists": path.exists(),
        "sizeMB": round(path.stat().st_size / 1024 / 1024, 2) if path.exists() else 0,
        "duration": round(float(fmt.get("duration") or 0), 6),
        "videoStreams": len(video),
        "audioStreams": len(audio),
        "video": [
            {
                "codec": stream.get("codec_name"),
                "width": stream.get("width"),
                "height": stream.get("height"),
                "rate": stream.get("r_frame_rate"),
            }
            for stream in video
        ],
        "audio": [
            {
                "codec": stream.get("codec_name"),
                "sampleRate": stream.get("sample_rate"),
                "channels": stream.get("channels"),
            }
            for stream in audio
        ],
        "creationTime": creation_time,
    }


def tag(tag_type: str, start: float, duration: float, label: str) -> dict:
    return {
        "id": stable_uuid(f"tag::{label}::{tag_type}::{start:.3f}::{duration:.3f}"),
        "type": tag_type,
        "startTime": max(0.0, round(start, 6)),
        "duration": max(0.0, round(duration, 6)),
    }


def lane(
    *,
    name: str,
    path: Path,
    role: str,
    media_kind: str,
    track_ids: list[str],
    duration: float,
    offset: float,
    vault_root: Path,
    is360: bool = False,
    proxy_path: Path | None = None,
    tag_type: str = "Cut",
    ignore: bool = False,
    label: str = "",
    notes: list[str] | None = None,
) -> dict:
    label = label or name
    source_id = stable_uuid(f"source::{path}")
    lane_id = stable_uuid(f"lane::{name}::{path}")
    expected_proxy = proxy_path or expected_proxy_path(path, vault_root)
    source_video = {
        "id": source_id,
        "mediaURL": file_uri(path),
        "duration": round(duration, 6),
        "offset": round(offset, 6),
        "is360": bool(is360),
    }
    if expected_proxy.exists():
        source_video["proxyURL"] = file_uri(expected_proxy)

    return {
        "id": lane_id,
        "name": name,
        "sourceVideo": source_video,
        "tags": [tag(tag_type, 0, duration, label)] if duration > 0 else [],
        "metadata": {
            "sourceAssetId": f"episode-5-{stable_uuid(str(path))[:8].lower()}",
            "mediaKind": media_kind,
            "role": role,
            "trackIds": track_ids,
            "sourcePath": str(path),
            "originalPath": str(path),
            "vaultProxyPath": str(expected_proxy),
            "assetFingerprint": stable_uuid(f"asset::{path}").lower(),
            "declaredExists": path.exists(),
            "sourceLabel": label,
            "isPremiereRescue": False,
            "ignoreForProduction": bool(ignore),
            "notes": notes or [],
        },
    }


def media_item(path: Path, vault_root: Path, proxy_path: Path | None = None) -> dict:
    item = {
        "id": stable_uuid(f"media::{path}"),
        "url": file_uri(path),
        "name": path.name,
    }
    expected_proxy = proxy_path or expected_proxy_path(path, vault_root)
    if expected_proxy.exists():
        item["proxyURL"] = file_uri(expected_proxy)
    return item


def build(root: Path, session_dir: Path, report_dir: Path, current_state_dir: Path, vault_root: Path) -> tuple[Path, Path, Path, dict]:
    if not root.exists():
        raise SystemExit(f"Episode 5 root does not exist: {root}")

    media_exts = {".mov", ".mp4", ".m4v", ".wav", ".m4a", ".mp3", ".aif", ".aiff", ".insv", ".lrv"}
    source_files = [
        path
        for path in sorted(root.iterdir(), key=lambda item: item.name.lower())
        if path.is_file() and path.suffix.lower() in media_exts
    ]
    probes = {path.name: probe(path) for path in source_files}

    def dur(name: str) -> float:
        return float(probes.get(name, {}).get("duration") or 0.0)

    lanes: list[dict] = []
    media: list[dict] = []

    def add_lane(**kwargs) -> None:
        lanes.append(lane(vault_root=vault_root, **kwargs))
        media.append(media_item(kwargs["path"], vault_root, kwargs.get("proxy_path")))

    charlie = root / "CharlieVideo.mp4"
    mvi = root / "MVI_4011.mp4"
    sequence_duration = max(dur(charlie.name), dur(mvi.name))

    add_lane(
        name="Charlie Camera / Audio Spine - CharlieVideo.mp4",
        path=charlie,
        role="charlie_camera_audio_spine_candidate",
        media_kind="video",
        track_ids=["V1", "A1"],
        duration=dur(charlie.name),
        offset=0,
        tag_type="Active",
        label="Primary Episode 5 spine candidate. Same duration as MVI_4011; use as first-pass program and audio reference.",
        notes=[
            "Huge HEVC original stays untouched.",
            "Needs managed proxy before comfortable long-form editing/export.",
            "Duration matches MVI_4011.mp4 exactly, so both are provisionally offset 0.",
        ],
    )

    add_lane(
        name="Second Long Camera / Audio Candidate - MVI_4011.mp4",
        path=mvi,
        role="second_long_camera_audio_candidate",
        media_kind="video",
        track_ids=["V2", "A2"],
        duration=dur(mvi.name),
        offset=0,
        tag_type="Cut",
        label="Second full-length source candidate. Same duration as CharlieVideo; likely sync offset 0.",
        notes=[
            "Huge HEVC original stays untouched.",
            "Held out of program decisions until reviewed against CharlieVideo.",
        ],
    )

    lrv_specs = [
        ("VID_20260402_080506_00_001.insv", "LRV_20260402_080506_01_001.lrv"),
        ("VID_20260402_080506_00_002.insv", "LRV_20260402_080506_01_002.lrv"),
        ("VID_20260402_080506_00_003.insv", "LRV_20260402_080506_01_003.lrv"),
        ("VID_20260402_080506_00_004.insv", "LRV_20260402_080506_01_004.lrv"),
    ]
    running_offset = 0.0
    for index, (raw_name, lrv_name) in enumerate(lrv_specs, start=1):
        raw = root / raw_name
        lrv = root / lrv_name
        lrv_proxy = expected_proxy_path(lrv, vault_root) if lrv.exists() else None
        duration = dur(lrv_name) or dur(raw_name)
        add_lane(
            name=f"Homer Insta360 Segment {index} - {raw_name}",
            path=raw,
            role="homer_insta360_source_segment",
            media_kind="video",
            track_ids=[f"V{index + 2}"],
            duration=duration,
            offset=running_offset,
            proxy_path=lrv_proxy,
            is360=True,
            tag_type="Cut",
            label=f"Homer Insta360 whole segment {index}. LRV sidecar is the proxy/review source.",
            notes=[
                f"LRV sidecar: {lrv}" if lrv.exists() else "LRV sidecar missing; generate proxy from raw INSV only if needed.",
                "Offset is sequential fallback because exact clap/waveform sync has not been proven yet.",
                "Segment stays whole; later SHOW decisions choose when to cut to Homer.",
            ],
        )
        running_offset += duration

    contextual = [
        ("Bench Roy.mp4", "bench_roy_context_clip"),
        ("Forgive Nate.mp4", "forgive_nate_context_clip"),
        ("Roy Injured.mp4", "roy_injured_context_clip"),
        ("Samwise.mp4", "samwise_context_clip"),
    ]
    for idx, (filename, role) in enumerate(contextual, start=20):
        add_lane(
            name=f"HELD Context Clip - {filename}",
            path=root / filename,
            role=role,
            media_kind="video",
            track_ids=[f"V{idx}"],
            duration=dur(filename),
            offset=0,
            tag_type="Cut",
            ignore=True,
            label="Contextual weave-in candidate. Place by conversation meaning, not by file start.",
            notes=["Held out of program decisions until a conversation moment calls for it."],
        )

    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    sequence_id = stable_uuid("sequence::episode-5-sync-stack-v1")
    project_id = stable_uuid("project::episode-5-sync-stack-v1")
    session = {
        "activeSequenceId": sequence_id,
        "savedAt": now,
        "project": {
            "id": project_id,
            "title": "Episode 5 Sync Stack",
            "mediaBin": media,
            "nestDocuments": [],
            "sequences": [
                {
                    "id": sequence_id,
                    "title": "Episode 5 Sync Stack",
                    "orientationTrack": {"id": stable_uuid("orientation::episode5::16x9"), "keyframes": []},
                    "verticalOrientationTrack": {"id": stable_uuid("orientation::episode5::9x16"), "keyframes": []},
                    "lanes": lanes,
                    "shortClipQueue": [],
                    "transcriptSegments": [],
                    "transcriptJobs": [],
                    "editCorrectionNotes": [],
                    "editActionLedger": [],
                    "publishReceipts": [],
                    "editPassContext": {
                        "label": "Episode 5 first sync stack",
                        "actor": "Codex",
                        "actorType": "agent",
                        "passNumber": 1,
                        "goal": "Create a proxy-first whole-source sync stack for Episode 5 using the two full-length sources, Homer Insta360 segments, and held context clips.",
                        "status": "active",
                        "startedAt": now,
                        "updatedAt": now,
                    },
                }
            ],
        },
    }

    session_dir.mkdir(parents=True, exist_ok=True)
    report_dir.mkdir(parents=True, exist_ok=True)
    current_state_dir.mkdir(parents=True, exist_ok=True)
    session_path = session_dir / f"{SESSION_NAME}.quipsly-session.json"
    report_path = report_dir / f"{SESSION_NAME}-report.json"
    markdown_path = current_state_dir / f"{SESSION_NAME}.md"

    report = {
        "model": "episode-5-sync-stack-builder",
        "version": "2026-06-23.v1",
        "sessionName": SESSION_NAME,
        "sessionPath": str(session_path),
        "sourceRoot": str(root),
        "createdAt": now,
        "counts": {
            "lanes": len(lanes),
            "mediaItems": len(media),
            "heldLanes": sum(1 for item in lanes if (item.get("metadata") or {}).get("ignoreForProduction")),
            "candidateLanes": sum(1 for item in lanes if not (item.get("metadata") or {}).get("ignoreForProduction")),
            "proxyReadyLanes": sum(1 for item in lanes if (item.get("sourceVideo") or {}).get("proxyURL")),
            "needsProxyLanes": sum(1 for item in lanes if item["metadata"]["mediaKind"] == "video" and not (item.get("sourceVideo") or {}).get("proxyURL")),
            "sequenceDurationSeconds": round(sequence_duration, 6),
            "homerSequentialCoverageSeconds": round(running_offset, 6),
        },
        "syncAssumptions": [
            "CharlieVideo.mp4 and MVI_4011.mp4 have identical duration and are provisionally aligned at offset 0.",
            "CharlieVideo.mp4 is the first-pass program/audio spine until human review or waveform evidence says otherwise.",
            "Homer Insta360 segments are stacked sequentially from their LRV durations because exact sync proof is not available yet.",
            "Reference clips are context candidates, not exact watched-block truth.",
        ],
        "knownRisks": [
            "No separate high-quality audio source has been identified in the Episode 5 folder.",
            "CharlieVideo.mp4 and MVI_4011.mp4 are huge HEVC files; generate managed proxies before serious editing/export.",
            "Homer Insta360 sync is sequential fallback, not final clap/waveform alignment.",
            "The four context clips need placement by conversation meaning.",
        ],
        "probes": probes,
        "lanes": [
            {
                "name": item["name"],
                "role": item["metadata"]["role"],
                "mediaKind": item["metadata"]["mediaKind"],
                "trackIds": item["metadata"]["trackIds"],
                "offset": item["sourceVideo"]["offset"],
                "duration": item["sourceVideo"]["duration"],
                "proxyURL": item["sourceVideo"].get("proxyURL", ""),
                "expectedProxyPath": item["metadata"].get("vaultProxyPath", ""),
                "ignoreForProduction": item["metadata"].get("ignoreForProduction", False),
                "label": item["metadata"].get("sourceLabel", ""),
                "notes": item["metadata"].get("notes", []),
            }
            for item in lanes
        ],
        "nextSafeActions": [
            "Generate managed proxies for CharlieVideo.mp4 and MVI_4011.mp4.",
            "Generate or attach managed MP4 proxies for the four LRV sidecars.",
            "Load the session in Quipsly Studio and verify the two long sources at offset 0.",
            "Create rough SHOW/SKIP decisions only after proxy playback is comfortable.",
            "Park context clips until the conversation moment calls for them.",
        ],
        "truth": "Whole sources are intact. This builder writes native Quipsly session metadata only and does not mutate original media.",
    }

    session_path.write_text(json.dumps(session, indent=2, sort_keys=True), encoding="utf-8")
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
    markdown_path.write_text(render_markdown(report), encoding="utf-8")
    return session_path, report_path, markdown_path, report


def render_markdown(report: dict) -> str:
    lines = [
        "# Episode 5 Sync Stack v1",
        "",
        f"- Session: `{report['sessionName']}`",
        f"- Session path: `{report['sessionPath']}`",
        f"- Source root: `{report['sourceRoot']}`",
        f"- Created: `{report['createdAt']}`",
        "",
        "## Counts",
        "",
    ]
    for key, value in report["counts"].items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Sync assumptions", ""])
    for item in report["syncAssumptions"]:
        lines.append(f"- {item}")
    lines.extend(["", "## Known risks", ""])
    for item in report["knownRisks"]:
        lines.append(f"- {item}")
    lines.extend(["", "## Lanes", ""])
    for lane_info in report["lanes"]:
        held = "held" if lane_info["ignoreForProduction"] else "candidate"
        proxy = "proxy ready" if lane_info["proxyURL"] else "proxy needed"
        track = ",".join(lane_info["trackIds"])
        lines.append(
            f"- `{track}` {lane_info['name']} "
            f"({lane_info['role']}, {held}, {proxy}) "
            f"offset `{lane_info['offset']:.3f}s`, duration `{lane_info['duration']:.3f}s`"
        )
    lines.extend(["", "## Next safe actions", ""])
    for item in report["nextSafeActions"]:
        lines.append(f"- {item}")
    lines.extend(["", f"Truth: {report['truth']}", ""])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--session-dir", type=Path, default=DEFAULT_SESSION_DIR)
    parser.add_argument("--report-dir", type=Path, default=DEFAULT_REPORT_DIR)
    parser.add_argument("--current-state-dir", type=Path, default=DEFAULT_CURRENT_STATE_DIR)
    parser.add_argument("--vault-root", type=Path, default=DEFAULT_VAULT_ROOT)
    args = parser.parse_args()
    session_path, report_path, markdown_path, report = build(
        args.root,
        args.session_dir,
        args.report_dir,
        args.current_state_dir,
        args.vault_root,
    )
    print(json.dumps({
        "ok": True,
        "sessionName": SESSION_NAME,
        "sessionPath": str(session_path),
        "reportPath": str(report_path),
        "markdownPath": str(markdown_path),
        "counts": report["counts"],
        "truth": report["truth"],
    }, indent=2))


if __name__ == "__main__":
    main()
