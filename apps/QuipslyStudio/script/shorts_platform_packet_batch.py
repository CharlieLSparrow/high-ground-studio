#!/usr/bin/env python3
"""Generate metadata-only platform packets for multiple active-session shorts.

This batch path reads the running editor's /shorts_queue rows directly. It does
not change selected short state. Use shorts_select_wait.py when interactive
selection proof matters. This command does not edit, export, approve, upload,
publish, create receipt truth, or mutate media.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from selected_short_platform_packet import markdown, platform_variants, slug  # noqa: E402

DEFAULT_BASE_URL = "http://127.0.0.1:8080"
DEFAULT_OUTPUT_ROOT = Path("/Volumes/My Passport/Quipsly/QuipslyExports/PlatformPacketBatches")
SCHEMA = "quipsly.studio.shorts-platform-packet-batch.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def fetch_json(url: str, timeout: float = 8.0) -> dict[str, Any]:
    with urllib.request.urlopen(url, timeout=timeout) as response:
        data = json.loads(response.read().decode("utf-8", errors="replace"))
    if not isinstance(data, dict):
        raise ValueError(f"Expected JSON object from {url}")
    return data


def text(value: Any) -> str:
    if value is None:
        return ""
    return value if isinstance(value, str) else str(value)


def queue_items(queue: dict[str, Any]) -> list[dict[str, Any]]:
    for key in ("clips", "shorts", "items"):
        value = queue.get(key)
        if isinstance(value, list):
            return [row for row in value if isinstance(row, dict)]
    return []


def select_short(base_url: str, index: int, short_id: str) -> dict[str, Any]:
    if short_id:
        query = urllib.parse.urlencode({"id": short_id})
    else:
        query = urllib.parse.urlencode({"index": str(index)})
    return fetch_json(base_url.rstrip("/") + "/shorts_queue_select?" + query)


def expected_from_receipt(receipt: dict[str, Any]) -> tuple[str, str]:
    projection = receipt.get("selectionProjection") if isinstance(receipt.get("selectionProjection"), dict) else {}
    proof = projection.get("selectedShortProof") if isinstance(projection.get("selectedShortProof"), dict) else {}
    return text(projection.get("id") or proof.get("id")), text(proof.get("title"))


def wait_quality(base_url: str, expected_id: str, expected_title: str, timeout: float) -> dict[str, Any]:
    deadline = time.time() + max(0.5, timeout)
    last: dict[str, Any] = {}
    # AgentServer selection receipts are scheduling evidence. A /state read gives
    # the mounted editor loop a chance to drain the queued command before we
    # judge selected-short quality.
    try:
        fetch_json(base_url.rstrip("/") + "/state", timeout=3.0)
    except Exception:
        pass
    time.sleep(0.20)
    while time.time() <= deadline:
        quality = fetch_json(base_url.rstrip("/") + "/selected_short_quality", timeout=3.0)
        last = quality
        selected_id = text(quality.get("selectedShortId"))
        title = text(quality.get("title"))
        if expected_id and selected_id == expected_id:
            return quality
        if not expected_id and expected_title and title.lower() == expected_title.lower():
            return quality
        if not expected_id and not expected_title and (selected_id or title):
            return quality
        time.sleep(0.25)
    raise TimeoutError(
        f"Timed out waiting for selected short quality. expected_id={expected_id!r} expected_title={expected_title!r} "
        f"last_id={text(last.get('selectedShortId'))!r} last_title={text(last.get('title'))!r}"
    )


def write_short_packet(packet: dict[str, Any], folder: Path, index: int) -> dict[str, str]:
    short = packet.get("selectedShort") if isinstance(packet.get("selectedShort"), dict) else {}
    title = text(short.get("title")) or f"short-{index:02d}"
    base = f"{index:02d}-{slug(title)}"
    json_path = folder / f"{base}-platform-packet.json"
    md_path = folder / f"{base}-platform-packet.md"
    json_path.write_text(json.dumps(packet, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    md_path.write_text(markdown(packet) + "\n", encoding="utf-8")
    return {"jsonPath": str(json_path), "markdownPath": str(md_path)}


def packet_from_queue_row(state: dict[str, Any], row: dict[str, Any], index: int) -> dict[str, Any]:
    duration = row.get("recipeDuration") or row.get("duration") or 0
    short = {
        "id": text(row.get("id")) or f"queue-index-{index}",
        "title": text(row.get("title")) or f"Short {index}",
        "hook": text(row.get("hookText") or row.get("hook") or row.get("overlayText") or row.get("title")),
        "overlay": text(row.get("primaryOverlayText") or row.get("overlayText") or row.get("title")),
        "caption": text(row.get("captionDraft") or row.get("caption") or row.get("notes") or row.get("hookText")),
        "durationSeconds": float(duration or 0),
        "reviewStatus": text(row.get("reviewStatus")),
        "exportStatus": text(row.get("exportStatus")),
        "reviewClassLabel": text(row.get("reviewClassLabel") or row.get("reviewClass")),
    }
    return {
        "schema": "quipsly.studio.selected-short-platform-packet.v1",
        "status": "selected_short_platform_packet",
        "generatedAt": iso_now(),
        "activeSessionName": text(state.get("activeSessionName")),
        "selectedShort": short,
        "platformVariants": platform_variants(short),
        "readyCount": 0,
        "totalCount": 7,
        "nextSafeAction": "Review the export, then edit platform copy before any manual posting or Tower handoff.",
        "safeCommands": {
            "brief": "script/agentctl.sh shorts-review-brief --markdown",
            "quality": "script/agentctl.sh selected-short-quality",
            "singleSelectionProof": f"script/agentctl.sh shorts-select-wait id {short['id']} 10",
            "platformPacketBatch": "script/agentctl.sh shorts-platform-packet-batch --limit 5",
        },
        "truth": (
            "Metadata-only local platform packet built from the live /shorts_queue item. It does not approve, "
            "schedule, upload, publish, create receipt truth, or mutate source media/session recipes."
        ),
    }


def build_batch(args: argparse.Namespace) -> dict[str, Any]:
    base_url = args.base_url.rstrip("/")
    state = fetch_json(base_url + "/state")
    queue = fetch_json(base_url + "/shorts_queue")
    items = queue_items(queue)
    if not items:
        raise SystemExit("No short queue items found in running editor.")

    session = text(state.get("activeSessionName")) or "unknown-session"
    batch_folder = args.output_root / slug(session, "unknown-session") / f"{stamp()}-platform-packet-batch"
    if not args.dry_run:
        batch_folder.mkdir(parents=True, exist_ok=False)

    limit = args.limit if args.limit and args.limit > 0 else len(items)
    start = max(1, args.start_index)
    end = min(len(items), start + limit - 1)
    rows: list[dict[str, Any]] = []

    for index in range(start, end + 1):
        queue_row = items[index - 1]
        row: dict[str, Any] = {
            "index": index,
            "queueTitle": text(queue_row.get("title")),
            "queueId": text(queue_row.get("id")),
            "status": "pending",
        }
        try:
            packet = packet_from_queue_row(state, queue_row, index)
            short = packet["selectedShort"]
            row.update({
                "status": "packet-ready" if args.dry_run else "packet-written",
                "selectedShortId": text(short.get("id")),
                "title": text(short.get("title")),
                "reviewStatus": text(short.get("reviewStatus")),
                "exportStatus": text(short.get("exportStatus")),
                "reviewClassLabel": text(short.get("reviewClassLabel")),
                "platformVariantCount": len(packet.get("platformVariants") or []),
                "truth": "Packet was built from the live /shorts_queue item. Use shorts-select-wait for one-at-a-time selected-short proof.",
            })
            if not args.dry_run:
                row["artifact"] = write_short_packet(packet, batch_folder, index)
        except Exception as exc:  # keep the batch moving and document the blocker
            row.update({
                "status": "blocked",
                "error": str(exc),
                "truth": "This short did not produce a packet. No source media or publication state was changed.",
            })
        rows.append(row)

    manifest = {
        "schema": SCHEMA,
        "status": "shorts_platform_packet_batch",
        "generatedAt": iso_now(),
        "activeSessionName": session,
        "startIndex": start,
        "endIndex": end,
        "requestedLimit": limit,
        "shortQueueCount": len(items),
        "outputFolder": str(batch_folder) if not args.dry_run else "dry-run",
        "summary": {
            "written": sum(1 for row in rows if row["status"] == "packet-written"),
            "readyDryRun": sum(1 for row in rows if row["status"] == "packet-ready"),
            "blocked": sum(1 for row in rows if row["status"] == "blocked"),
        },
        "items": rows,
        "truth": (
            "Metadata-only batch platform packet prep from the running editor's /shorts_queue. Use shorts-select-wait "
            "for one-at-a-time selected-short proof. This does not edit, approve, export, upload, publish, create receipt truth, "
            "or mutate source media/session recipes."
        ),
    }

    if not args.dry_run:
        manifest_path = batch_folder / "platform-packet-batch-manifest.json"
        manifest_md_path = batch_folder / "platform-packet-batch-summary.md"
        manifest["manifestPath"] = str(manifest_path)
        manifest["markdownPath"] = str(manifest_md_path)
        manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        manifest_md_path.write_text(markdown_summary(manifest) + "\n", encoding="utf-8")
    return manifest


def markdown_summary(manifest: dict[str, Any]) -> str:
    lines = [
        "# Shorts Platform Packet Batch",
        "",
        f"- Session: `{manifest['activeSessionName']}`",
        f"- Shorts: `{manifest['startIndex']}` to `{manifest['endIndex']}` of `{manifest['shortQueueCount']}`",
        f"- Output: `{manifest['outputFolder']}`",
        f"- Written: `{manifest['summary']['written']}`",
        f"- Blocked: `{manifest['summary']['blocked']}`",
        "",
        "Truth: " + manifest["truth"],
        "",
        "## Items",
        "",
    ]
    for row in manifest["items"]:
        title = row.get("title") or row.get("queueTitle") or "untitled"
        lines.append(f"- {row['index']:02d}. **{title}**: `{row['status']}`")
        if row.get("artifact"):
            lines.append(f"  - Markdown: `{row['artifact']['markdownPath']}`")
        if row.get("error"):
            lines.append(f"  - Error: {row['error']}")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--start-index", type=int, default=1)
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--timeout", type=float, default=8.0)
    parser.add_argument("--settle-seconds", type=float, default=1.0)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    args = parser.parse_args()

    manifest = build_batch(args)
    if args.markdown:
        print(markdown_summary(manifest))
    else:
        print(json.dumps(manifest, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
