#!/usr/bin/env python3
"""Build a first-pass native Quipsly Studio sync-stack session for Episode 6.

The goal is not to recreate a Premiere timeline. The goal is to create a
proxy-first, whole-source Quipsly session:

- one sequence-time spine
- whole synced source lanes
- explicit offsets and assumptions
- contextual clips held as weave-in candidates
- no chopped source media
- no mutation of originals
"""

from __future__ import annotations

import argparse
import json
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

APP_NAMESPACE = uuid.UUID("4c843490-4b67-4cd8-891b-000000000006")
SESSION_NAME = "episode-6-sync-stack-v1"
DEFAULT_ROOT = Path("/Volumes/My Passport/Episode 6")
DEFAULT_SESSION_DIR = Path.home() / "Library/Application Support/Quipsly/MediaVault/sessions"
DEFAULT_REPORT_DIR = Path("reports")
DEFAULT_CURRENT_STATE_DIR = Path("../../docs/quipsly/current-state")

FNV_OFFSET = 0xCBF29CE484222325
FNV_PRIME = 0x100000001B3
AUDIO_EXTENSIONS = {".wav", ".aif", ".aiff", ".mp3", ".m4a", ".aac", ".flac"}


def stable_uuid(label: str) -> str:
    return str(uuid.uuid5(APP_NAMESPACE, label)).upper()


def fnv1a64_hex(value: str) -> str:
    h = FNV_OFFSET
    for b in value.encode("utf-8"):
        h ^= b
        h = (h * FNV_PRIME) & 0xFFFFFFFFFFFFFFFF
    return f"{h:016x}"


def safe_filename(value: str) -> str:
    allowed = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._- "
    cleaned = "".join(ch if ch in allowed else "-" for ch in value)
    cleaned = cleaned.replace(" ", "_")
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


def parse_creation_time(value: str) -> datetime | None:
    if not value:
        return None
    try:
        if value.endswith("Z"):
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def probe(path: Path) -> dict:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    try:
        data = json.loads(subprocess.check_output(cmd, text=True, timeout=45, stderr=subprocess.STDOUT) or "{}")
    except Exception as exc:
        return {
            "path": str(path),
            "file": path.name,
            "exists": path.exists(),
            "duration": 0.0,
            "probeError": str(exc),
            "videoStreams": 0,
            "audioStreams": 0,
            "creationTime": "",
        }

    fmt = data.get("format") or {}
    streams = data.get("streams") or []
    video = [s for s in streams if s.get("codec_type") == "video"]
    audio = [s for s in streams if s.get("codec_type") == "audio"]
    fmt_tags = fmt.get("tags") or {}
    creation_time = fmt_tags.get("creation_time") or ""
    if not creation_time:
        for stream in streams:
            tags = stream.get("tags") or {}
            creation_time = tags.get("creation_time") or ""
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
                "codec": s.get("codec_name"),
                "width": s.get("width"),
                "height": s.get("height"),
                "rate": s.get("r_frame_rate"),
            }
            for s in video
        ],
        "audio": [
            {
                "codec": s.get("codec_name"),
                "sampleRate": s.get("sample_rate"),
                "channels": s.get("channels"),
            }
            for s in audio
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
            "sourceAssetId": f"episode-6-{stable_uuid(str(path))[:8].lower()}",
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
        raise SystemExit(f"Episode 6 root does not exist: {root}")

    media_exts = {".mov", ".mp4", ".m4v", ".wav", ".m4a", ".mp3", ".aif", ".aiff", ".insv", ".lrv"}
    source_files = [
        p
        for p in sorted(root.iterdir(), key=lambda item: item.name.lower())
        if p.is_file() and p.suffix.lower() in media_exts
    ]
    probes = {p.name: probe(p) for p in source_files}

    def dur(name: str) -> float:
        return float(probes.get(name, {}).get("duration") or 0.0)

    def creation(name: str) -> datetime | None:
        return parse_creation_time(str(probes.get(name, {}).get("creationTime") or ""))

    charlie = root / "CharlieVideo.mp4"
    charlie_start = creation(charlie.name)

    lrv_specs = [
        ("VID_20260507_180459_00_080.insv", "LRV_20260507_180459_01_080.lrv"),
        ("VID_20260507_180459_00_081.insv", "LRV_20260507_180459_01_081.lrv"),
        ("VID_20260507_180459_00_082.insv", "LRV_20260507_180459_01_082.lrv"),
    ]

    def offset_from_charlie(name: str, fallback: float) -> float:
        started = creation(name)
        if charlie_start and started:
            return max(0.0, round((started - charlie_start).total_seconds(), 6))
        return fallback

    lanes: list[dict] = []
    media: list[dict] = []

    def add_lane(**kwargs):
        lanes.append(lane(vault_root=vault_root, **kwargs))
        media.append(media_item(kwargs["path"], vault_root, kwargs.get("proxy_path")))

    # Audio spine/candidates.
    phone_spine = root / "Recording in Phone….m4a"
    duplicate_phone = root / "Recording in Phone… 2.m4a"
    hq_audio = root / "Untitled_1 #03Episode 6.1.wav"
    hq_pickup = root / "Untitled_1 #04Episode 6.2.wav"

    add_lane(
        name="Call Audio Spine Candidate - Recording in Phone….m4a",
        path=phone_spine,
        role="call_audio_spine_candidate",
        media_kind="audio",
        track_ids=["A1"],
        duration=dur(phone_spine.name),
        offset=0,
        tag_type="Active",
        label="Initial call/spine candidate. Needs waveform sync confirmation against Charlie and HQ WAV.",
        notes=[
            "Selected because it spans the full conversation.",
            "Phone creation_time is not trusted for sync; sequence offset is provisional.",
        ],
    )

    add_lane(
        name="HELD duplicate phone audio - Recording in Phone… 2.m4a",
        path=duplicate_phone,
        role="duplicate_or_alternate_call_audio",
        media_kind="audio",
        track_ids=["A9"],
        duration=dur(duplicate_phone.name),
        offset=0,
        tag_type="Cut",
        ignore=True,
        label="Held duplicate-length phone audio. Compare before using.",
    )

    add_lane(
        name="HQ Audio Candidate - Untitled_1 #03Episode 6.1.wav",
        path=hq_audio,
        role="high_quality_audio_primary_candidate",
        media_kind="audio",
        track_ids=["A2"],
        duration=dur(hq_audio.name),
        offset=0,
        tag_type="Cut",
        label="Likely final-quality audio once waveform-aligned.",
        notes=["WAV creation_time is only a clock string, so no offset was inferred."],
    )

    add_lane(
        name="HELD HQ Audio Pickup - Untitled_1 #04Episode 6.2.wav",
        path=hq_pickup,
        role="high_quality_audio_pickup_or_break_candidate",
        media_kind="audio",
        track_ids=["A3"],
        duration=dur(hq_pickup.name),
        offset=0,
        tag_type="Cut",
        ignore=True,
        label="Held pickup/break segment until aligned.",
    )

    # Visual spine and Homer sources.
    add_lane(
        name="Charlie Camera - CharlieVideo.mp4",
        path=charlie,
        role="charlie_camera_source",
        media_kind="video",
        track_ids=["V1"],
        duration=dur(charlie.name),
        offset=0,
        tag_type="Active",
        label="Provisional base visual lane. Generate proxy before serious visual editing.",
        notes=["Embedded creation_time is used as the visual timebase for Homer LRV offsets."],
    )

    running_fallback = 0.0
    for index, (raw_name, lrv_name) in enumerate(lrv_specs, start=1):
        raw = root / raw_name
        lrv = root / lrv_name
        lrv_proxy = expected_proxy_path(lrv, vault_root) if lrv.exists() else None
        offset = offset_from_charlie(lrv_name, running_fallback)
        add_lane(
            name=f"Homer Insta360 Segment {index} - {raw_name}",
            path=raw,
            proxy_path=lrv_proxy,
            role="homer_insta360_source_segment",
            media_kind="video",
            track_ids=[f"V{index + 1}"],
            duration=dur(raw_name),
            offset=offset,
            is360=True,
            tag_type="Cut",
            label=f"Homer Insta360 whole segment {index}. LRV is the proxy/review source.",
            notes=[
                "Offset inferred from embedded LRV creation_time relative to CharlieVideo.mp4.",
                f"LRV sidecar source: {lrv}" if lrv.exists() else "LRV sidecar missing; generate a managed proxy before visual review.",
                "Segment stays whole; later SHOW decisions choose when to cut to Homer.",
            ],
        )
        running_fallback = offset + dur(raw_name)

    # Contextual clips. These are intentionally visible but held, because Episode 6
    # uses clips as woven visual references, not one exact watch block.
    contextual = [
        ("Joe 1.mp4", "joe_contextual_clip"),
        ("Joe 2.mp4", "joe_contextual_clip"),
        ("McFarland 1 Opening Locker Room.mp4", "mcfarland_contextual_clip"),
        ("Mcfarland 2 Picking.mp4", "mcfarland_contextual_clip"),
        ("Mcfarland 2 Superhuman.mp4", "mcfarland_contextual_clip"),
        ("Rocky 1 Training Montage.mp4", "rocky_contextual_clip"),
        ("Rocky IV.mp4", "rocky_contextual_clip"),
        ("Rocky Montage.mp4", "rocky_contextual_clip"),
    ]
    for idx, (filename, role) in enumerate(contextual, start=10):
        path = root / filename
        add_lane(
            name=f"HELD Context Clip - {filename}",
            path=path,
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
    sequence_id = stable_uuid("sequence::episode-6-sync-stack-v1")
    project_id = stable_uuid("project::episode-6-sync-stack-v1")
    session = {
        "activeSequenceId": sequence_id,
        "savedAt": now,
        "project": {
            "id": project_id,
            "title": "Episode 6 Sync Stack",
            "mediaBin": media,
            "nestDocuments": [],
            "sequences": [
                {
                    "id": sequence_id,
                    "title": "Episode 6 Sync Stack",
                    "orientationTrack": {"id": stable_uuid("orientation::episode6::16x9"), "keyframes": []},
                    "verticalOrientationTrack": {"id": stable_uuid("orientation::episode6::9x16"), "keyframes": []},
                    "lanes": lanes,
                    "shortClipQueue": [],
                    "transcriptSegments": [],
                    "transcriptJobs": [],
                    "editCorrectionNotes": [],
                    "editActionLedger": [],
                    "publishReceipts": [],
                    "editPassContext": {
                        "label": "Episode 6 first sync stack",
                        "actor": "Codex",
                        "actorType": "agent",
                        "passNumber": 1,
                        "goal": "Create a proxy-first whole-source sync stack for Charlie, Homer Insta360, call audio, HQ audio candidates, and contextual weave-in clips.",
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
        "model": "episode-6-sync-stack-builder",
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
        },
        "syncAssumptions": [
            "Phone M4A is the provisional audio spine because it spans the full conversation.",
            "CharlieVideo.mp4 is the provisional visual timebase.",
            "Homer Insta360 segment offsets are inferred from LRV embedded creation_time relative to CharlieVideo.mp4.",
            "Homer Insta360 raw INSV files stay canonical; managed MP4 proxies are generated from the LRV sidecars for review.",
            "CharlieVideo.mp4 and Homer LRV sidecars should have generated vault proxies before serious visual editing.",
            "HQ WAV #03 is held as likely final audio until waveform-aligned.",
            "Rocky/McFarland/Joe clips are contextual weave-in candidates, not whole watched blocks.",
        ],
        "knownRisks": [
            "Phone M4A creation_time appears untrustworthy and was not used for sync.",
            "WAV creation_time is not a full timestamp and was not used for sync.",
            "CharlieVideo.mp4 is huge HEVC source; do not scrub raw as the production path.",
            "Context clips are held until manually/AI placed against conversation meaning.",
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
            "Open the Episode 6 Sync Stack in Quipsly Studio and verify the Charlie/Homer offsets visually.",
            "Run waveform/fingerprint alignment for phone M4A, Charlie audio, Homer LRVs, and HQ WAV #03.",
            "Create first SHOW/SKIP decisions only after visual/audio sync proof.",
            "Place contextual clips as overlay/source decisions where conversation meaning calls for them.",
        ],
        "truth": "Whole sources are intact. This builder writes native Quipsly session metadata only and does not mutate original media.",
    }

    session_path.write_text(json.dumps(session, indent=2, sort_keys=True), encoding="utf-8")
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
    markdown_path.write_text(render_markdown(report), encoding="utf-8")
    return session_path, report_path, markdown_path, report


def render_markdown(report: dict) -> str:
    lines = [
        "# Episode 6 Sync Stack v1",
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
        lines.append(
            f"- `{lane_info['trackIds'][0]}` {lane_info['name']} "
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
    parser.add_argument("--vault-root", type=Path, default=Path.home() / "Library/Application Support/Quipsly/MediaVault")
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
