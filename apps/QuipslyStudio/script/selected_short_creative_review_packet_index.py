#!/usr/bin/env python3
"""Index saved selected-short creative review packets.

Saved packets are review artifacts, not export proof or publication receipts.
This helper summarizes them without changing app state or source media.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path.home() / "Movies" / "QuipslyExports" / "ShortCreativeReviewPackets"


def s(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def n(value: Any) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return 0.0
    return 0.0


def nested(payload: dict[str, Any], *keys: str) -> Any:
    current: Any = payload
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def read_json(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def markdown_summary(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8", errors="replace")
    title = ""
    status = ""
    readiness = ""
    duration = 0.0
    hook = ""
    caption = ""
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("- Title:"):
            title = stripped.split(":", 1)[1].strip()
        elif stripped.startswith("- Status:"):
            status = stripped.split(":", 1)[1].strip().strip("`")
        elif stripped.startswith("- Readiness:"):
            readiness = stripped.split(":", 1)[1].strip().strip("`")
        elif stripped.startswith("- Time:"):
            duration_text = stripped.rsplit("(", 1)[-1].replace("s)", "").strip() if "(" in stripped else ""
            duration = n(duration_text)
        elif stripped.startswith("- Hook:"):
            hook = stripped.split(":", 1)[1].strip()
        elif stripped.startswith("- Caption/text:"):
            caption = stripped.split(":", 1)[1].strip()
    return {
        "path": str(path),
        "fileName": path.name,
        "kind": "markdown",
        "title": title or path.stem,
        "reviewStatus": status,
        "readiness": readiness,
        "duration": duration,
        "hook": hook,
        "captionDraft": caption,
        "modifiedAt": path.stat().st_mtime,
    }


def json_summary(path: Path, payload: dict[str, Any]) -> dict[str, Any]:
    selected = nested(payload, "selectedShort") or {}
    creative = nested(payload, "creativeSurface") or {}
    return {
        "path": str(path),
        "fileName": path.name,
        "kind": "json",
        "title": s(selected.get("title")) or path.stem,
        "reviewStatus": s(selected.get("reviewStatus")),
        "readiness": s(selected.get("readiness")),
        "duration": n(selected.get("duration")),
        "timecode": s(selected.get("timecode")),
        "hook": s(creative.get("hook")),
        "captionDraft": s(creative.get("captionDraft")),
        "primaryPlatform": s(creative.get("primaryPlatform")),
        "riskCount": len(creative.get("risks") or []),
        "strengthCount": len(creative.get("strengths") or []),
        "nextActionCount": len(creative.get("nextActions") or []),
        "modifiedAt": path.stat().st_mtime,
    }


def build_index(root: Path, limit: int) -> dict[str, Any]:
    root = root.expanduser().resolve()
    entries: list[dict[str, Any]] = []
    if root.exists():
        for path in sorted(root.glob("*"), key=lambda p: p.stat().st_mtime, reverse=True):
            if not path.is_file() or path.suffix.lower() not in {".json", ".md"}:
                continue
            if path.stat().st_size <= 0:
                continue
            if path.suffix.lower() == ".json":
                payload = read_json(path)
                if payload is None:
                    continue
                entries.append(json_summary(path, payload))
            else:
                entries.append(markdown_summary(path))
            if len(entries) >= limit:
                break

    readiness_counts: dict[str, int] = {}
    needs_hook = 0
    needs_caption = 0
    for entry in entries:
        readiness = s(entry.get("readiness")) or "unknown"
        readiness_counts[readiness] = readiness_counts.get(readiness, 0) + 1
        if not s(entry.get("hook")) or s(entry.get("hook")).lower().startswith("no explicit hook"):
            needs_hook += 1
        if not s(entry.get("captionDraft")) or s(entry.get("captionDraft")).lower().startswith("no caption"):
            needs_caption += 1

    next_actions: list[str] = []
    if not entries:
        next_actions.append("Save a selected short creative review packet first: script/agentctl.sh selected-short-creative-review-packet-save")
    if needs_hook:
        next_actions.append(f"Review hooks for {needs_hook} packet(s). A short without a first-three-seconds promise is not ready for posting.")
    if needs_caption:
        next_actions.append(f"Review caption/text overlay for {needs_caption} packet(s), especially face-safe 9:16 placement.")
    if entries and not next_actions:
        next_actions.append("Open the newest packets and compare against real playback/export proof before platform handoff.")

    return {
        "status": "selected_short_creative_review_packet_index",
        "model": "quipslystudio-selected-short-creative-review-packet-index",
        "root": str(root),
        "count": len(entries),
        "readinessCounts": readiness_counts,
        "needsHookCount": needs_hook,
        "needsCaptionCount": needs_caption,
        "packets": entries,
        "nextActions": next_actions,
        "safeCommands": {
            "savePacket": "script/agentctl.sh selected-short-creative-review-packet-save",
            "latestMarkdown": "script/agentctl.sh selected-short-creative-review-packet-index --markdown",
            "latestJson": "script/agentctl.sh selected-short-creative-review-packet-index --json",
        },
        "truth": "Read-only index of saved selected-short creative review packets. These packets are review artifacts, not rendered export proof or publication receipts.",
    }


def render_markdown(index: dict[str, Any]) -> str:
    lines = [
        "# Selected Short Creative Review Packet Index",
        "",
        s(index.get("truth")) or "Read-only packet index.",
        "",
        f"Root: `{s(index.get('root'))}`",
        f"Packets indexed: {int(n(index.get('count')))}",
        f"Needs hook review: {int(n(index.get('needsHookCount')))}",
        f"Needs caption review: {int(n(index.get('needsCaptionCount')))}",
        "",
        "## Readiness counts",
    ]
    readiness = index.get("readinessCounts") or {}
    if readiness:
        for key, value in sorted(readiness.items()):
            lines.append(f"- `{key}`: {value}")
    else:
        lines.append("- none yet")

    lines.extend(["", "## Recent packets"])
    packets = index.get("packets") or []
    if not packets:
        lines.append("- No saved packets found yet.")
    else:
        for packet in packets[:12]:
            title = s(packet.get("title")) or s(packet.get("fileName"))
            readiness_value = s(packet.get("readiness")) or "unknown"
            duration = n(packet.get("duration"))
            hook = s(packet.get("hook")) or "No hook recorded."
            caption = s(packet.get("captionDraft")) or "No caption recorded."
            lines.append(f"- {title} | `{readiness_value}` | {duration:.1f}s | `{s(packet.get('fileName'))}`")
            lines.append(f"  Hook: {hook}")
            lines.append(f"  Caption: {caption}")

    lines.extend(["", "## Next actions"])
    for action in index.get("nextActions") or []:
        lines.append(f"- {s(action)}")
    lines.extend(["", "Truth: metadata review packets are not rendered videos. Watch/export proof still matters before publication."])
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Index saved selected-short creative review packets.")
    parser.add_argument("root", nargs="?", default=str(DEFAULT_ROOT))
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    args = parser.parse_args()

    index = build_index(Path(args.root), max(1, args.limit))
    if args.json:
        print(json.dumps(index, indent=2, sort_keys=True))
    else:
        print(render_markdown(index), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
