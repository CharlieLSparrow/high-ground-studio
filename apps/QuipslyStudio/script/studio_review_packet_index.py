#!/usr/bin/env python3
"""List recent Quipsly Studio review packets.

Review packets are useful only if humans and agents can find them again. This
read-only index scans the packet folder and summarizes current focus, selected
decision, selected short, warnings, and safe next file to open.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


DEFAULT_ROOT = "~/Movies/QuipslyExports/StudioReviewPackets"


def dict_value(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def list_value(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def text_value(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    return text if text else fallback


def read_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def packet_summary(folder: Path) -> dict[str, Any]:
    packet_json = folder / "studio-review-packet.json"
    payload = read_json(packet_json)
    focus = dict_value(payload.get("recommendedFocus"))
    decision = dict_value(payload.get("selectedDecisionSummary"))
    short = dict_value(payload.get("selectedShortSummary"))
    warnings = list_value(payload.get("endpointWarnings"))
    return {
        "folder": str(folder),
        "name": folder.name,
        "generatedAt": text_value(payload.get("generatedAt"), folder.name.split("-")[0] if "-" in folder.name else ""),
        "focusLane": text_value(focus.get("lane"), "unknown"),
        "focusLabel": text_value(focus.get("label"), "unknown"),
        "firstAction": text_value(focus.get("firstAction"), "Open README.md and AGENT_NEXT_ACTION.md."),
        "decisionLane": text_value(decision.get("laneName"), "none"),
        "decisionRisk": text_value(decision.get("risk"), "unknown"),
        "decisionStyle": text_value(decision.get("cutStyle"), "unknown"),
        "shortTitle": text_value(short.get("title"), "none"),
        "shortScore": short.get("qualityScore", 0),
        "warningCount": len(warnings),
        "hasReadme": (folder / "README.md").exists(),
        "hasAgentNextAction": (folder / "AGENT_NEXT_ACTION.md").exists(),
        "openFirst": str(folder / "AGENT_NEXT_ACTION.md"),
        "truth": "Packet index is read-only. It does not mutate session, media, exports, or publication state.",
    }


def find_packets(root: Path, limit: int) -> list[dict[str, Any]]:
    if not root.exists():
        return []
    folders = [path for path in root.iterdir() if path.is_dir()]
    folders.sort(key=lambda path: path.stat().st_mtime, reverse=True)
    return [packet_summary(folder) for folder in folders[:limit]]


def render_markdown(root: Path, packets: list[dict[str, Any]]) -> str:
    lines = [
        "# Studio review packet index",
        "",
        f"- Root: `{root}`",
        f"- Packets shown: {len(packets)}",
        "",
    ]
    if not packets:
        lines.extend([
            "No review packets found.",
            "",
            "Create one with:",
            "",
            "`/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/studio-review-packet`",
            "",
        ])
        return "\n".join(lines)

    for index, packet in enumerate(packets, start=1):
        lines.extend([
            f"## {index}. {packet['name']}",
            "",
            f"- Focus: `{packet['focusLane']}` - {packet['focusLabel']}",
            f"- First action: {packet['firstAction']}",
            f"- Decision: {packet['decisionLane']} / `{packet['decisionStyle']}` / risk `{packet['decisionRisk']}`",
            f"- Short: {packet['shortTitle']} / score {packet['shortScore']}",
            f"- Warnings: {packet['warningCount']}",
            f"- Open first: `{packet['openFirst']}`",
            f"- Folder: `{packet['folder']}`",
            "",
        ])
    lines.append("Truth: packet index is read-only evidence discovery, not approval or publication proof.")
    return "\n".join(lines).strip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="List recent Quipsly Studio review packets.")
    parser.add_argument("--root", default=DEFAULT_ROOT)
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--json", action="store_true", help="Print JSON instead of Markdown.")
    args = parser.parse_args()

    root = Path(args.root).expanduser()
    packets = find_packets(root, max(1, args.limit))
    payload = {
        "model": "quipsly-studio-review-packet-index",
        "root": str(root),
        "packetCount": len(packets),
        "packets": packets,
        "safeCommands": {
            "createPacket": "/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/studio-review-packet",
            "listPackets": "/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/studio-review-packet-index",
        },
        "truth": "Read-only packet index. It does not mutate session, media, exports, or publication state.",
    }
    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(root, packets))
    return 0


if __name__ == "__main__":
    sys.exit(main())
