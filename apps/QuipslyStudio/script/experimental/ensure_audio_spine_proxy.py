#!/usr/bin/env python3
"""Create/attach a managed audio-spine proxy lane to a Quipsly native session.

This keeps the product contract honest:
- whole source media stays untouched
- release audio comes from a managed vault proxy
- audio readiness is represented by an explicit audio lane, not a video lane
  that happens to contain embedded audio
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import uuid
from pathlib import Path
from urllib.parse import quote, unquote, urlparse

FNV_OFFSET = 0xCBF29CE484222325
FNV_PRIME = 0x100000001B3


def fnv1a64_hex(value: str) -> str:
    h = FNV_OFFSET
    for b in value.encode("utf-8"):
        h ^= b
        h = (h * FNV_PRIME) & 0xFFFFFFFFFFFFFFFF
    return f"{h:016x}"


def safe_filename(value: str) -> str:
    out = "".join(ch if re.match(r"[A-Za-z0-9._\- ]", ch) else "-" for ch in value)
    out = out.replace(" ", "_")
    while "__" in out:
        out = out.replace("__", "_")
    return out.strip("._-") or "asset"


def file_url(path: Path) -> str:
    return "file://" + quote(str(path), safe="/:")


def path_from_file_url(value: str | None) -> str | None:
    if not value:
        return None
    parsed = urlparse(value)
    if parsed.scheme == "file":
        return unquote(parsed.path)
    return value


def resolve_tool(name: str, configured: str | None = None) -> str:
    candidates: list[str] = []
    if configured:
        candidates.append(configured)
    for entry in os.environ.get("PATH", "").split(os.pathsep):
        if entry:
            candidates.append(str(Path(entry) / name))
    candidates.extend([f"/opt/homebrew/bin/{name}", f"/usr/local/bin/{name}", f"/usr/bin/{name}", f"/bin/{name}"])
    for candidate in candidates:
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    raise SystemExit(f"{name} not found. Install {name} or set QUIPSLY_{name.upper()}_PATH.")


def ffprobe_duration(ffprobe: str, source: Path) -> float:
    completed = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(source),
        ],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if completed.returncode != 0:
        raise SystemExit((completed.stderr or completed.stdout or "ffprobe duration failed").strip())
    try:
        return max(0.0, float(completed.stdout.strip()))
    except ValueError as error:
        raise SystemExit(f"ffprobe returned invalid duration for {source}: {completed.stdout!r}") from error


def ffprobe_has_audio(ffprobe: str, source: Path) -> bool:
    completed = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-select_streams",
            "a:0",
            "-show_entries",
            "stream=index",
            "-of",
            "csv=p=0",
            str(source),
        ],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    return completed.returncode == 0 and bool(completed.stdout.strip())


def audio_proxy_path(source: Path, root: Path) -> Path:
    standardized = str(source.resolve(strict=False))
    asset_id = fnv1a64_hex(standardized + "::audio-spine")
    return root / "proxy" / asset_id / f"{safe_filename(source.stem)}_audio_spine_proxy.m4a"


def create_audio_proxy(ffmpeg: str, ffprobe: str, source: Path, output: Path, force: bool) -> dict:
    if not source.is_file():
        raise SystemExit(f"Missing source file: {source}")
    if not ffprobe_has_audio(ffprobe, source):
        raise SystemExit(f"Source has no readable audio stream: {source}")

    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists() and not force:
        return {
            "generated": False,
            "proxy": str(output),
            "proxyBytes": output.stat().st_size,
            "duration": ffprobe_duration(ffprobe, output),
        }

    tmp = output.with_name(f".{output.stem}.partial-{uuid.uuid4().hex}.m4a")
    if tmp.exists():
        tmp.unlink()
    cmd = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-nostdin",
        "-loglevel",
        "error",
        "-i",
        str(source),
        "-map",
        "0:a:0",
        "-vn",
        "-c:a",
        "aac",
        "-b:a",
        os.environ.get("QUIPSLY_AUDIO_PROXY_BITRATE", "160k"),
        "-ar",
        "48000",
        "-ac",
        "2",
        "-movflags",
        "+faststart",
        str(tmp),
    ]
    completed = subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
    if completed.returncode != 0:
        if tmp.exists():
            tmp.unlink()
        raise SystemExit((completed.stdout or f"ffmpeg exited {completed.returncode}").strip())
    tmp.replace(output)
    return {
        "generated": True,
        "proxy": str(output),
        "proxyBytes": output.stat().st_size,
        "duration": ffprobe_duration(ffprobe, output),
    }


def deterministic_uuid(namespace: str, value: str) -> str:
    return str(uuid.uuid5(uuid.UUID("6f2b92cf-3fe7-4c43-94f1-f9f86b5f4d3d"), f"{namespace}:{value}")).upper()


def find_source_lane(sequence: dict, source_path: Path) -> dict | None:
    source_resolved = str(source_path.resolve(strict=False))
    for lane in sequence.get("lanes") or []:
        source_video = lane.get("sourceVideo") or {}
        candidates = [
            path_from_file_url(source_video.get("mediaURL")),
            path_from_file_url(source_video.get("proxyURL")),
            (lane.get("metadata") or {}).get("originalPath"),
            (lane.get("metadata") or {}).get("sourcePath"),
        ]
        if any(candidate and str(Path(candidate).resolve(strict=False)) == source_resolved for candidate in candidates):
            return lane
    return None


def ensure_audio_lane(session_path: Path, source_path: Path, proxy_path: Path, duration: float, dry_run: bool) -> dict:
    data = json.loads(session_path.read_text())
    project = data.setdefault("project", {})
    sequences = project.setdefault("sequences", [])
    if not sequences:
        raise SystemExit(f"Session has no sequences: {session_path}")
    sequence = sequences[0]
    lanes = sequence.setdefault("lanes", [])

    source_lane = find_source_lane(sequence, source_path)
    source_offset = ((source_lane or {}).get("sourceVideo") or {}).get("offset") or 0
    source_name = (source_lane or {}).get("name") or source_path.name
    lane_id = deterministic_uuid("audio-spine-lane", str(source_path.resolve(strict=False)))
    source_id = deterministic_uuid("audio-spine-source", str(source_path.resolve(strict=False)))
    tag_id = deterministic_uuid("audio-spine-tag", str(source_path.resolve(strict=False)))
    asset_id = f"{fnv1a64_hex(str(source_path.resolve(strict=False)) + '::audio-spine')}"

    audio_lane = {
        "id": lane_id,
        "name": f"Audio Spine Proxy - {source_path.name}",
        "sourceVideo": {
            "id": source_id,
            "mediaURL": file_url(source_path),
            "proxyURL": file_url(proxy_path),
            "duration": duration,
            "offset": source_offset,
            "is360": False,
        },
        "metadata": {
            "sourceAssetId": f"audio-spine-{asset_id}",
            "mediaKind": "audio",
            "role": "audio_spine_proxy",
            "trackIds": ["A1"],
            "sourcePath": str(source_path),
            "originalPath": str(source_path),
            "vaultProxyPath": str(proxy_path),
            "assetFingerprint": asset_id,
            "declaredExists": True,
            "sourceLabel": f"Managed audio spine extracted from {source_name}. Original media remains untouched.",
            "isPremiereRescue": False,
            "ignoreForProduction": False,
        },
        "tags": [
            {
                "id": tag_id,
                "startTime": 0,
                "duration": duration,
                "type": "Active",
            }
        ],
    }

    existing_index = next(
        (
            index
            for index, lane in enumerate(lanes)
            if lane.get("id") == lane_id
            or (lane.get("metadata") or {}).get("role") == "audio_spine_proxy"
            and (lane.get("metadata") or {}).get("originalPath") == str(source_path)
        ),
        None,
    )

    if existing_index is None:
        insert_at = 1 if source_lane is not None and lanes else len(lanes)
        lanes.insert(insert_at, audio_lane)
        action = "inserted"
    else:
        lanes[existing_index] = audio_lane
        action = "updated"

    if not dry_run:
        backup = session_path.with_suffix(session_path.suffix + ".before-audio-spine")
        if not backup.exists():
            backup.write_text(session_path.read_text())
        session_path.write_text(json.dumps(data, indent=2, sort_keys=True))

    return {
        "action": action,
        "session": str(session_path),
        "laneId": lane_id,
        "sourceId": source_id,
        "proxy": str(proxy_path),
        "duration": duration,
        "sourceOffset": source_offset,
        "dryRun": dry_run,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Ensure a Quipsly session has an explicit managed audio-spine proxy lane.")
    parser.add_argument("--session", required=True, help="Native session name or absolute .quipsly-session.json path.")
    parser.add_argument("--source", required=True, help="Media file whose first audio stream should become the spine proxy.")
    parser.add_argument("--root", default=os.environ.get("QUIPSLY_MEDIA_VAULT", str(Path.home() / "Library/Application Support/Quipsly/MediaVault")))
    parser.add_argument("--ffmpeg", default=os.environ.get("QUIPSLY_FFMPEG_PATH"))
    parser.add_argument("--ffprobe", default=os.environ.get("QUIPSLY_FFPROBE_PATH"))
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    root = Path(args.root)
    session_arg = Path(args.session)
    if session_arg.suffix == ".json" or args.session.endswith(".quipsly-session.json"):
        session_path = session_arg
    else:
        session_path = root / "sessions" / f"{args.session}.quipsly-session.json"
    if not session_path.is_file():
        raise SystemExit(f"Missing session file: {session_path}")

    source = Path(args.source)
    ffmpeg = resolve_tool("ffmpeg", args.ffmpeg)
    ffprobe = resolve_tool("ffprobe", args.ffprobe)
    proxy = audio_proxy_path(source, root)
    proxy_result = create_audio_proxy(ffmpeg, ffprobe, source, proxy, args.force)
    attach_result = ensure_audio_lane(session_path, source, Path(proxy_result["proxy"]), proxy_result["duration"], args.dry_run)
    print(json.dumps({"proxy": proxy_result, "session": attach_result}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
