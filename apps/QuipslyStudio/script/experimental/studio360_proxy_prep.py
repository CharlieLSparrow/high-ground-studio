#!/usr/bin/env python3
"""Prepare a managed review proxy for a Studio360 group.

This writes only Quipsly-managed derivative artifacts. Originals and source
companions are read-only. For early 360 workflow proof, low-res `.lrv`
companions are preferred because they are already camera-generated review media.
If no companion exists, the command can transcode a short bounded proxy from the
original source.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_POINTER = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360/latest-360-workflow-packet.json")
DEFAULT_OUTPUT_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360")


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip()).strip("-").lower()
    return slug or "studio360-group"


def load_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload if isinstance(payload, dict) else {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def append_event(output_root: Path, event: dict[str, Any]) -> None:
    with (output_root / "studio360-proxy-events.jsonl").open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, sort_keys=True) + "\n")


def run_command(args: list[str], timeout: int = 120) -> tuple[int, str, str]:
    try:
        completed = subprocess.run(args, check=False, capture_output=True, text=True, timeout=timeout)
        return completed.returncode, completed.stdout, completed.stderr
    except Exception as exc:
        return 99, "", str(exc)


def resolve_packet(packet_value: str) -> Path:
    if packet_value and packet_value != "latest":
        path = Path(packet_value).expanduser()
        if path.is_dir():
            return path / "360-workflow-packet.json"
        return path
    pointer = load_json(DEFAULT_POINTER)
    packet_path = pointer.get("packetPath")
    if not packet_path:
        raise SystemExit(f"No latest Studio360 packet pointer found at {DEFAULT_POINTER}")
    return Path(str(packet_path))


def choose_group(packet: dict[str, Any], selector: str) -> dict[str, Any]:
    groups = packet.get("groups") if isinstance(packet.get("groups"), list) else []
    if not groups:
        raise SystemExit("Studio360 packet has no groups")
    if selector == "first-needs-proxy":
        for group in groups:
            if group.get("status") == "needs-proxy":
                return group
    if selector == "first-with-companion":
        for group in groups:
            if group.get("status") == "has-low-res-companion":
                return group
    if selector == "first-actionable":
        for preferred in ("has-low-res-companion", "needs-proxy", "proxy-ready"):
            for group in groups:
                if group.get("status") == preferred:
                    return group
    for group in groups:
        if selector in {group.get("id"), group.get("groupKey")}:
            return group
    raise SystemExit(f"No Studio360 group matched selector: {selector}")


def asset_maps(packet: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        str(item.get("id")): item
        for item in packet.get("items") or []
        if isinstance(item, dict) and item.get("id")
    }


def choose_source(group: dict[str, Any], items_by_id: dict[str, dict[str, Any]]) -> tuple[dict[str, Any], str]:
    assets = [items_by_id[item_id] for item_id in group.get("assets") or [] if item_id in items_by_id]
    for kind in ("proxy", "insta360-low-res-companion", "video-export-or-source", "insta360-original-video"):
        for asset in assets:
            if asset.get("kind") == kind:
                reason = {
                    "proxy": "existing-proxy",
                    "insta360-low-res-companion": "camera-low-res-companion",
                    "video-export-or-source": "video-source",
                    "insta360-original-video": "original-transcode-source",
                }[kind]
                return asset, reason
    raise SystemExit(f"Group has no usable media asset: {group.get('groupKey')}")


def ffprobe(path: Path) -> dict[str, Any]:
    code, stdout, stderr = run_command([
        "ffprobe",
        "-v", "error",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        str(path),
    ], timeout=30)
    if code != 0:
        return {"ok": False, "error": stderr.strip() or "ffprobe failed"}
    try:
        payload = json.loads(stdout)
    except Exception:
        return {"ok": False, "error": "ffprobe returned invalid JSON"}
    streams = payload.get("streams") or []
    video = next((stream for stream in streams if stream.get("codec_type") == "video"), None)
    audio = next((stream for stream in streams if stream.get("codec_type") == "audio"), None)
    fmt = payload.get("format") or {}
    try:
        duration = float(fmt.get("duration") or 0)
    except Exception:
        duration = 0
    return {
        "ok": True,
        "durationSeconds": duration,
        "hasVideo": bool(video),
        "hasAudio": bool(audio),
        "width": video.get("width") if video else None,
        "height": video.get("height") if video else None,
        "videoCodec": video.get("codec_name") if video else "",
        "audioCodec": audio.get("codec_name") if audio else "",
    }


def prepare_proxy(args: argparse.Namespace) -> dict[str, Any]:
    packet_path = resolve_packet(args.packet)
    packet = load_json(packet_path)
    group = choose_group(packet, args.selector)
    items_by_id = asset_maps(packet)
    source_asset, source_reason = choose_source(group, items_by_id)
    source_path = Path(str(source_asset.get("sourcePath") or ""))
    if not source_path.exists():
        raise SystemExit(f"Source asset missing: {source_path}")
    source_probe = ffprobe(source_path)

    output_root = Path(args.output_root).expanduser()
    group_slug = slugify(str(group.get("groupKey") or group.get("id") or "studio360"))
    session_dir = output_root / "proxy-prep" / group_slug / datetime.now().strftime("%Y%m%d-%H%M%S")
    session_dir.mkdir(parents=True, exist_ok=False)
    proxy_dir = session_dir / "proxies"
    proxy_dir.mkdir(parents=True, exist_ok=True)

    proxy_path = proxy_dir / f"{group_slug}-review-proxy.mp4"
    command: list[str] = []
    mode = args.mode
    if mode == "auto":
        mode = "copy" if source_asset.get("kind") in {"proxy", "insta360-low-res-companion"} else "transcode"

    if mode == "copy":
        shutil.copy2(source_path, proxy_path)
    elif mode == "transcode":
        command = [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-i", str(source_path),
            "-t", str(args.seconds),
            "-vf", f"scale='min({args.max_width},iw)':-2",
            "-r", str(args.fps),
            "-c:v", "h264_videotoolbox",
            "-b:v", args.video_bitrate,
            "-an",
            str(proxy_path),
        ]
        code, _stdout, stderr = run_command(command, timeout=max(60, int(args.seconds) * 8))
        if code != 0:
            if proxy_path.exists():
                proxy_path.unlink(missing_ok=True)
            error = stderr.strip() or "ffmpeg proxy transcode failed"
            manifest = {
                "schema": "quipsly.360.proxy-prep.v1",
                "generatedAt": iso_now(),
                "ok": False,
                "status": "failed",
                "packetPath": str(packet_path),
                "group": group,
                "sourceAsset": source_asset,
                "sourceReason": source_reason,
                "sourceProbe": source_probe,
                "mode": mode,
                "command": command,
                "proxyPath": "",
                "proxyProbe": {"ok": False, "error": "Proxy was not created."},
                "error": error,
                "truth": "Managed Studio360 proxy prep failed safely. Original/source asset is untouched.",
                "safety": {
                    "originalsMutated": False,
                    "sourceDeleted": False,
                    "externalPublishing": False,
                    "writesStayInsideSessionDir": True,
                },
                "nextSafestAction": "Use a matching LRV/proxy companion, re-download or repair the original, or park this source as needing media repair before 360 reframe/export work.",
            }
            manifest_path = session_dir / "proxy-prep-manifest.json"
            write_json(manifest_path, manifest)
            append_event(output_root, {
                "createdAt": manifest["generatedAt"],
                "status": "failed",
                "groupKey": group.get("groupKey"),
                "groupId": group.get("id"),
                "sourcePath": str(source_path),
                "proxyPath": "",
                "mode": mode,
                "error": error,
                "originalsMutated": False,
            })
            latest_failure = {
                "schema": "quipsly.360.latest-proxy-prep-failure.v1",
                "updatedAt": iso_now(),
                "status": "failed",
                "sessionDir": str(session_dir),
                "manifestPath": str(manifest_path),
                "groupKey": group.get("groupKey"),
                "sourcePath": str(source_path),
                "mode": mode,
                "error": error,
                "humanAsk": "Review this proxy-prep failure before retrying. Confirm source availability, ffmpeg support, and whether a companion/proxy route is safer.",
                "agentSafeParallelWork": "Codex may summarize the failure, prepare retry diagnostics, and improve source-routing notes. Do not delete, overwrite, repair, upload, publish, mutate originals, or mark a repair decision.",
                "nextSafestAction": manifest["nextSafestAction"],
                "originalsMutated": False,
            }
            write_json(output_root / "latest-360-proxy-prep-failure.json", latest_failure)
            return {
                "ok": False,
                "sessionDir": str(session_dir),
                "manifestPath": str(manifest_path),
                "groupKey": group.get("groupKey"),
                "sourcePath": str(source_path),
                "sourceReason": source_reason,
                "mode": mode,
                "error": error,
                "originalsMutated": False,
                "nextSafestAction": manifest["nextSafestAction"],
            }
    else:
        raise SystemExit(f"Unsupported mode: {mode}")

    probe = ffprobe(proxy_path)
    manifest = {
        "schema": "quipsly.360.proxy-prep.v1",
        "generatedAt": iso_now(),
        "packetPath": str(packet_path),
        "group": group,
        "sourceAsset": source_asset,
        "sourceReason": source_reason,
        "sourceProbe": source_probe,
        "mode": mode,
        "command": command,
        "proxyPath": str(proxy_path),
        "proxyProbe": probe,
        "truth": "Managed Studio360 review proxy. Original/source asset is untouched.",
        "safety": {
            "originalsMutated": False,
            "sourceDeleted": False,
            "externalPublishing": False,
            "writesStayInsideSessionDir": True,
        },
        "nextSafestAction": "Open the proxy for reframe/keyframe review, then generate 16:9 and 9:16 export recipes from metadata.",
    }
    write_json(session_dir / "proxy-prep-manifest.json", manifest)
    append_event(output_root, {
        "createdAt": manifest["generatedAt"],
        "status": "success",
        "groupKey": group.get("groupKey"),
        "groupId": group.get("id"),
        "sourcePath": str(source_path),
        "proxyPath": str(proxy_path),
        "mode": mode,
        "originalsMutated": False,
    })
    latest = {
        "schema": "quipsly.360.latest-proxy-prep.v1",
        "updatedAt": iso_now(),
        "status": "success",
        "sessionDir": str(session_dir),
        "manifestPath": str(session_dir / "proxy-prep-manifest.json"),
        "proxyPath": str(proxy_path),
        "groupKey": group.get("groupKey"),
        "mode": mode,
        "humanAsk": "Open the managed proxy and confirm it is usable for 360 reframe review before treating the source group as proof-ready.",
        "agentSafeParallelWork": "Codex may summarize proxy metadata, route it into reframe packets, and improve diagnostics. Do not delete, overwrite, upload, publish, mutate originals, or create receipt truth.",
        "nextSafestAction": manifest["nextSafestAction"],
        "originalsMutated": False,
    }
    write_json(output_root / "latest-360-proxy-prep.json", latest)
    return {
        "ok": True,
        "sessionDir": str(session_dir),
        "manifestPath": str(session_dir / "proxy-prep-manifest.json"),
        "proxyPath": str(proxy_path),
        "groupKey": group.get("groupKey"),
        "sourcePath": str(source_path),
        "sourceReason": source_reason,
        "mode": mode,
        "proxyProbe": probe,
        "originalsMutated": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare a safe Studio360 review proxy.")
    parser.add_argument("selector", nargs="?", default="first-actionable", help="group id/key, first-actionable, first-with-companion, or first-needs-proxy")
    parser.add_argument("--packet", default="latest")
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT))
    parser.add_argument("--mode", choices=["auto", "copy", "transcode"], default="auto")
    parser.add_argument("--seconds", type=float, default=20.0)
    parser.add_argument("--max-width", type=int, default=960)
    parser.add_argument("--fps", type=int, default=15)
    parser.add_argument("--video-bitrate", default="1200k")
    result = prepare_proxy(parser.parse_args())
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result.get("ok") else 2


if __name__ == "__main__":
    raise SystemExit(main())
