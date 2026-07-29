#!/usr/bin/env python3
"""Focus one Cut Rhythm Review Queue item in the running editor.

This helper reads a packet's queue.json, picks one item by rank or finding ID,
and prints the exact review instructions for that item. With --scrub it also
asks the local AgentServer to move the shared playhead to the first span start.

Scrubbing is navigation only. This script never edits, approves, exports,
publishes, deletes, or mutates source media.
"""

from __future__ import annotations

import argparse
import json
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


def dict_value(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def list_value(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def string_value(value: Any, default: str = "") -> str:
    if value is None:
        return default
    if isinstance(value, str):
        return value
    return str(value)


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def record_review_commands(packet_dir: Path, finding_id: str) -> dict[str, str]:
    base = f"script/agentctl.sh cut-rhythm-record-review {shell_quote(str(packet_dir))} {shell_quote(finding_id)}"
    return {
        "realProblem": (
            f"{base} real-problem --reviewer Codex --status refine "
            "--listen 'What I heard at normal speed' "
            "--tradeoff 'What improves if this cut changes' --edit-change-needed"
        ),
        "deliberateChoice": (
            f"{base} deliberate-choice --reviewer Codex --status keep "
            "--listen 'Why the current rhythm is intentional' --no-edit-change-needed"
        ),
        "falsePositive": (
            f"{base} false-positive --reviewer Codex --status keep "
            "--listen 'Why this was not a real rhythm problem after review' --no-edit-change-needed"
        ),
        "needsHumanEar": (
            f"{base} needs-human-ear --reviewer Codex --status listen "
            "--follow-up 'Needs Charlie/Mako/Homer ear before changing edit metadata'"
        ),
    }


def load_queue(packet_dir: Path) -> dict[str, Any]:
    queue_path = packet_dir / "queue.json"
    try:
        value = json.loads(queue_path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001 - operator-facing helper.
        return {
            "status": "queue_read_failed",
            "error": str(exc),
            "path": str(queue_path),
            "items": [],
        }
    return value if isinstance(value, dict) else {"status": "invalid_queue", "items": []}


def find_item(queue: dict[str, Any], selector: str) -> dict[str, Any]:
    items = [item for item in list_value(queue.get("items")) if isinstance(item, dict)]
    selector_text = selector.strip()
    selector_rank: int | None = None
    try:
        selector_rank = int(selector_text)
    except ValueError:
        selector_rank = None
    for item in items:
        if selector_rank is not None and int(item.get("rank", -1)) == selector_rank:
            return item
        if string_value(item.get("id")) == selector_text:
            return item
    return {}


def first_span_start(item: dict[str, Any]) -> float | None:
    spans = [span for span in list_value(item.get("spans")) if isinstance(span, dict)]
    if not spans:
        return None
    value = spans[0].get("start")
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None


def scrub(base_url: str, seconds: float) -> dict[str, Any]:
    query = urllib.parse.urlencode({"time": f"{seconds:.3f}"})
    url = base_url.rstrip("/") + "/scrub?" + query
    try:
        with urllib.request.urlopen(url, timeout=8) as response:
            return json.loads(response.read().decode("utf-8", errors="replace"))
    except Exception as exc:  # noqa: BLE001 - operator-facing helper.
        return {
            "status": "scrub_failed",
            "url": url,
            "error": str(exc),
        }


def make_focus(packet_dir: Path, selector: str, base_url: str, should_scrub: bool, pre_roll: float) -> dict[str, Any]:
    queue = load_queue(packet_dir)
    item = find_item(queue, selector)
    if not item:
        return {
            "status": "focus_item_not_found",
            "packetDir": str(packet_dir),
            "selector": selector,
            "availableIds": [
                string_value(candidate.get("id"))
                for candidate in list_value(queue.get("items"))
                if isinstance(candidate, dict)
            ],
            "truth": "No edit, export, publish, delete, or source-media mutation occurred.",
        }

    start = first_span_start(item)
    scrub_time = max(0.0, start - pre_roll) if start is not None else None
    scrub_receipt = scrub(base_url, scrub_time) if should_scrub and scrub_time is not None else {}
    return {
        "status": "cut_rhythm_focus_item",
        "packetDir": str(packet_dir),
        "selector": selector,
        "item": item,
        "scrubbed": bool(scrub_receipt),
        "scrubTime": scrub_time,
        "preRoll": pre_roll,
        "scrubReceipt": scrub_receipt,
        "safeNext": {
            "playThrough": "Use Play Through around this span to hear preserved cadence.",
            "playEdit": "Use Play Edit around this span to hear the edited result.",
            "sourceWall": "Compare Program Output against the source monitors before deciding.",
            "statusCommand": item.get("statusCommand", ""),
            "recordReviewCommands": record_review_commands(packet_dir, string_value(item.get("id"), "unknown-finding")),
        },
        "truth": "Navigation/read-only focus helper. It does not edit, approve, export, publish, delete, or mutate source media.",
    }


def render_markdown(focus: dict[str, Any]) -> str:
    item = dict_value(focus.get("item"))
    spans = list_value(item.get("spans"))
    safe_next = dict_value(focus.get("safeNext"))
    record_commands = dict_value(safe_next.get("recordReviewCommands"))
    lines = [
        "# Cut Rhythm Focus Item",
        "",
        f"- Status: `{focus.get('status', '')}`",
        f"- Truth: {focus.get('truth', '')}",
        f"- Packet: `{focus.get('packetDir', '')}`",
        f"- Selector: `{focus.get('selector', '')}`",
    ]
    if focus.get("status") != "cut_rhythm_focus_item":
        lines.extend(
            [
                f"- Available IDs: {', '.join(list_value(focus.get('availableIds')))}",
                "",
            ]
        )
        return "\n".join(lines).rstrip() + "\n"

    lines.extend(
        [
            f"- ID: `{item.get('id', '')}`",
            f"- Title: {item.get('title', '')}",
            f"- Severity: `{item.get('severity', '')}`",
            f"- Kind: `{item.get('kind', '')}`",
            f"- Review mode: `{item.get('reviewMode', '')}`",
            f"- First action: {item.get('firstAction', '')}",
            f"- Why: {item.get('why', '')}",
            f"- Recommendation: {item.get('recommendation', '')}",
            f"- Scrubbed: `{focus.get('scrubbed', False)}`",
            f"- Scrub time: `{focus.get('scrubTime', '')}`",
            f"- Pre-roll: `{focus.get('preRoll', '')}`",
            "",
            "## Spans",
            "",
        ]
    )
    for span in spans:
        if not isinstance(span, dict):
            continue
        lines.append(
            f"- `{span.get('lane', '')}` {span.get('start', '')} -> {span.get('end', '')} "
            f"({span.get('duration', '')}s, {span.get('type', '')})"
        )
    lines.extend(
        [
            "",
            "## Safe next",
            "",
            f"- Play Through: {safe_next.get('playThrough', '')}",
            f"- Play Edit: {safe_next.get('playEdit', '')}",
            f"- Source Wall: {safe_next.get('sourceWall', '')}",
            f"- Status command after review: `{safe_next.get('statusCommand', '')}`",
        ]
    )
    if record_commands:
        lines.extend(["", "## Record review outcome", ""])
        for key, command in record_commands.items():
            lines.append(f"- `{key}`: `{command}`")
    return "\n".join(lines).rstrip() + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Focus one cut rhythm queue item.")
    parser.add_argument("packet_dir")
    parser.add_argument("selector", nargs="?", default="1", help="Queue rank number or finding ID.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8080")
    parser.add_argument("--scrub", action="store_true", help="Move the Studio playhead near the first span start.")
    parser.add_argument("--pre-roll", type=float, default=2.0, help="Seconds before the first span start to scrub to. Default: 2.0")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    focus = make_focus(
        packet_dir=Path(args.packet_dir).expanduser(),
        selector=args.selector,
        base_url=args.base_url,
        should_scrub=args.scrub,
        pre_roll=max(0.0, args.pre_roll),
    )
    if args.json and not args.markdown:
        print(json.dumps(focus, indent=2, sort_keys=True))
    else:
        print(render_markdown(focus))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
