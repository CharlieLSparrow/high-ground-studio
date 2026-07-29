#!/usr/bin/env python3
"""Materialize editor-safe video proxies from a Quipsly custody manifest.

Originals are read-only inputs. Proxies are written through a partial file and
atomically promoted only after ffprobe confirms a usable video stream.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def state(path: Path) -> dict[str, Any]:
    try:
        stat = path.stat()
    except FileNotFoundError:
        return {"exists": False, "materialized": False, "sizeBytes": 0, "allocatedBlocks": 0}
    blocks = int(getattr(stat, "st_blocks", 0))
    return {
        "exists": True,
        "materialized": stat.st_size == 0 or blocks > 0,
        "sizeBytes": stat.st_size,
        "allocatedBlocks": blocks,
    }


def probe(path: Path) -> dict[str, Any] | None:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=codec_name,width,height,r_frame_rate:format=duration",
            "-of",
            "json",
            str(path),
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return None
    payload = json.loads(result.stdout)
    if not payload.get("streams"):
        return None
    return payload


def materialize(item: dict[str, Any], *, force: bool) -> dict[str, Any]:
    source = Path(item["source"]["path"])
    target = Path(item["proxy"]["path"])
    source_state = state(source)
    receipt: dict[str, Any] = {
        "id": item["id"],
        "source": str(source),
        "proxy": str(target),
        "sourceState": source_state,
        "startedAt": utc_now(),
    }
    if not source_state["materialized"]:
        receipt.update(status="held-source-not-materialized", finishedAt=utc_now())
        return receipt
    existing_probe = probe(target) if target.exists() else None
    if existing_probe and not force:
        receipt.update(status="already-ready", probe=existing_probe, finishedAt=utc_now())
        return receipt

    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_name(f".{target.name}.partial.mp4")
    partial.unlink(missing_ok=True)
    command = [
        "ffmpeg",
        "-hide_banner",
        "-nostdin",
        "-y",
        "-i",
        str(source),
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-vf",
        "scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2",
        "-c:v",
        "h264_videotoolbox",
        "-b:v",
        "4M",
        "-maxrate",
        "6M",
        "-bufsize",
        "12M",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        str(partial),
    ]
    result = subprocess.run(command, check=False, capture_output=True, text=True)
    receipt["command"] = command
    receipt["returnCode"] = result.returncode
    if result.returncode != 0:
        partial.unlink(missing_ok=True)
        receipt.update(
            status="failed",
            error="\n".join(result.stderr.splitlines()[-30:]),
            finishedAt=utc_now(),
        )
        return receipt
    proxy_probe = probe(partial)
    if not proxy_probe:
        partial.unlink(missing_ok=True)
        receipt.update(status="failed-probe", finishedAt=utc_now())
        return receipt
    os.replace(partial, target)
    receipt.update(status="ready", probe=proxy_probe, finishedAt=utc_now())
    return receipt


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("custody_manifest", type=Path)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--only", action="append", default=[])
    args = parser.parse_args()

    custody_path = args.custody_manifest.expanduser().resolve()
    custody = json.loads(custody_path.read_text(encoding="utf-8"))
    selected = set(args.only)
    video_items = [
        item
        for item in custody.get("items", [])
        if item.get("kind") == "video-source" and (not selected or item.get("id") in selected)
    ]
    receipts = []
    for index, item in enumerate(video_items, start=1):
        print(f"PROXY {index}/{len(video_items)} {item['id']}", flush=True)
        receipt = materialize(item, force=args.force)
        receipts.append(receipt)
        print(f"  {receipt['status']}", flush=True)

    result = {
        "schema": "quipsly.proxy-materialization-receipt.v1",
        "generatedAt": utc_now(),
        "custodyManifest": str(custody_path),
        "receipts": receipts,
        "summary": {
            "requested": len(video_items),
            "ready": sum(1 for item in receipts if item["status"] in {"ready", "already-ready"}),
            "held": sum(1 for item in receipts if item["status"].startswith("held")),
            "failed": sum(1 for item in receipts if item["status"].startswith("failed")),
        },
    }
    output = custody_path.with_name(custody_path.stem + ".proxy-readiness.json")
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"RECEIPT={output}")
    print(json.dumps(result["summary"], sort_keys=True))
    return 1 if result["summary"]["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
