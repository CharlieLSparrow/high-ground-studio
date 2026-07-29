#!/usr/bin/env python3
"""List recent Cut Rhythm Review Packets.

This is a read-only finder for packet folders. It exists so humans and agents
can recover the latest review context without spelunking through timestamped
export folders.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def string_value(value: Any, default: str = "") -> str:
    if value is None:
        return default
    if isinstance(value, str):
        return value
    return str(value)


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return value if isinstance(value, dict) else {}


def packet_entry(path: Path) -> dict[str, Any]:
    audit = load_json(path / "audit.json")
    queue = load_json(path / "queue.json")
    items = queue.get("items", []) if isinstance(queue.get("items"), list) else []
    first = items[0] if items and isinstance(items[0], dict) else {}
    counts = audit.get("findingCounts", {}) if isinstance(audit.get("findingCounts"), dict) else {}
    return {
        "path": str(path),
        "name": path.name,
        "modified": path.stat().st_mtime,
        "decisionCount": audit.get("decisionCount", 0),
        "findingCounts": counts,
        "firstFocus": audit.get("firstFocus", ""),
        "queueCount": len(items),
        "firstQueueItem": {
            "id": first.get("id", ""),
            "title": first.get("title", ""),
            "severity": first.get("severity", ""),
            "reviewMode": first.get("reviewMode", ""),
            "firstAction": first.get("firstAction", ""),
        },
        "safeCommands": {
            "openReadme": f"open {json.dumps(str(path / 'README.md'))}",
            "openWorkOrder": f"open {json.dumps(str(path / 'AGENT_WORK_ORDER.md'))}",
            "focusFirst": f"script/agentctl.sh cut-rhythm-focus-item {json.dumps(str(path))} 1 --markdown",
            "focusFirstAndScrub": f"script/agentctl.sh cut-rhythm-focus-item {json.dumps(str(path))} 1 --scrub --markdown",
            "summary": f"script/agentctl.sh cut-rhythm-review-summary {json.dumps(str(path))} --markdown",
            "promotionPlan": f"script/agentctl.sh cut-rhythm-review-promotion-plan {json.dumps(str(path))} --markdown",
        },
    }


def make_index(root: Path, limit: int) -> dict[str, Any]:
    root = root.expanduser()
    packets = []
    if root.exists():
        for child in root.iterdir():
            if child.is_dir() and (child / "queue.json").exists() and (child / "audit.json").exists():
                packets.append(packet_entry(child))
    packets.sort(key=lambda item: item.get("modified", 0), reverse=True)
    entries = packets[:limit]
    return {
        "status": "cut_rhythm_packet_index",
        "root": str(root),
        "packetCount": len(packets),
        "returnedCount": len(entries),
        "entries": entries,
        "emptyState": "No cut rhythm packets found. Run script/agentctl.sh cut-rhythm-review-packet first."
        if not entries
        else "",
        "truth": "Read-only packet index. It does not edit, approve, export, publish, delete, or mutate source media.",
    }


def render_markdown(index: dict[str, Any]) -> str:
    entries = index.get("entries", []) if isinstance(index.get("entries"), list) else []
    lines = [
        "# Cut Rhythm Packet Index",
        "",
        f"- Status: `{index.get('status', '')}`",
        f"- Truth: {index.get('truth', '')}",
        f"- Root: `{index.get('root', '')}`",
        f"- Packets found: {index.get('packetCount', 0)}",
        f"- Returned: {index.get('returnedCount', 0)}",
        "",
    ]
    if not entries:
        lines.append(f"- {index.get('emptyState', '')}")
    for rank, entry in enumerate(entries, start=1):
        counts = entry.get("findingCounts", {}) if isinstance(entry.get("findingCounts"), dict) else {}
        first = entry.get("firstQueueItem", {}) if isinstance(entry.get("firstQueueItem"), dict) else {}
        commands = entry.get("safeCommands", {}) if isinstance(entry.get("safeCommands"), dict) else {}
        lines.extend(
            [
                f"## {rank}. {entry.get('name', '')}",
                "",
                f"- Path: `{entry.get('path', '')}`",
                f"- Decisions inspected: {entry.get('decisionCount', 0)}",
                f"- Findings: high={counts.get('high', 0)}, medium={counts.get('medium', 0)}, low={counts.get('low', 0)}, total={counts.get('total', 0)}",
                f"- First focus: {entry.get('firstFocus', '')}",
                f"- Queue count: {entry.get('queueCount', 0)}",
                f"- First queue item: `{first.get('id', '')}` {first.get('title', '')}",
                f"- First action: {first.get('firstAction', '')}",
                "",
                "### Safe commands",
                "",
            ]
        )
        for key, command in commands.items():
            lines.append(f"- `{key}`: `{command}`")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="List recent cut rhythm review packets.")
    parser.add_argument("--root", default=str(Path.home() / "Movies/QuipslyExports/CutRhythmPackets"))
    parser.add_argument("--limit", type=int, default=8)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    index = make_index(Path(args.root), limit=max(1, min(args.limit, 50)))
    if args.json and not args.markdown:
        print(json.dumps(index, indent=2, sort_keys=True))
    else:
        print(render_markdown(index))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
