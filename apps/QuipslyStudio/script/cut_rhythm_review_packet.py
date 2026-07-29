#!/usr/bin/env python3
"""Write a timestamped, read-only cut rhythm review packet.

The packet is meant for handoff: one folder a human or agent can open to see
the rhythm audit, the prioritized review queue, and the safest next action.
It does not edit, approve, export, publish, delete, or mutate source media.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path

from cut_rhythm_audit import make_audit, render_markdown as render_audit_markdown
from cut_rhythm_review_queue import make_queue, render_markdown as render_queue_markdown


def safe_slug(value: str) -> str:
    cleaned = []
    for char in value.strip():
        if char.isalnum() or char in "._-":
            cleaned.append(char)
        elif char.isspace():
            cleaned.append("-")
    slug = "".join(cleaned).strip("-._")
    return slug or "cut-rhythm-review-packet"


def packet_readme(audit: dict, queue: dict) -> str:
    counts = audit.get("findingCounts", {}) if isinstance(audit.get("findingCounts"), dict) else {}
    items = queue.get("items", []) if isinstance(queue.get("items"), list) else []
    first = items[0] if items and isinstance(items[0], dict) else {}
    lines = [
        "# Cut Rhythm Review Packet",
        "",
        "This packet is a read-only handoff for reviewing human-feeling podcast cuts.",
        "",
        "## Truth boundary",
        "",
        "- It does not edit, approve, export, publish, delete, or mutate source media.",
        "- It does not prove a cut is good.",
        "- It identifies spans worth listening to before a human or agent changes review status.",
        "",
        "## Start here",
        "",
        f"- Decisions inspected: {audit.get('decisionCount', 0)}",
        f"- Findings: high={counts.get('high', 0)}, medium={counts.get('medium', 0)}, low={counts.get('low', 0)}, total={counts.get('total', 0)}",
        f"- First focus: {audit.get('firstFocus', '')}",
        "",
    ]
    if first:
        lines.extend(
            [
                "## First queue item",
                "",
                f"- ID: `{first.get('id', '')}`",
                f"- Title: {first.get('title', '')}",
                f"- Severity: `{first.get('severity', '')}`",
                f"- Review mode: `{first.get('reviewMode', '')}`",
                f"- First action: {first.get('firstAction', '')}",
                f"- Status command: `{first.get('statusCommand', '')}`",
                "",
            ]
        )
    lines.extend(
        [
            "## Files",
            "",
            "- `audit.md`: broad rhythm risk map.",
            "- `audit.json`: machine-readable broad rhythm risk map.",
            "- `queue.md`: prioritized reviewer task list.",
            "- `queue.json`: machine-readable reviewer task list.",
            "- `AGENT_WORK_ORDER.md`: plain-language instructions for Codex or another reviewer.",
            "- `REVIEW_LEDGER_TEMPLATE.json`: structured notes template for reviewed findings.",
            "- `REVIEW_NOTES_TEMPLATE.md`: human-friendly notes template for reviewed findings.",
            "",
            "## Safe loop",
            "",
            "1. Open `queue.md`.",
            "2. Pick the first high or medium item.",
            "3. Scrub/play that span in Quipsly Studio.",
            "4. Use the item's review mode as the starting point.",
            "5. Mark Listen, Refine, Keep, or Hold only after listening.",
        ]
    )
    return "\n".join(lines).rstrip() + "\n"


def review_ledger_template(queue: dict) -> list[dict]:
    items = queue.get("items", []) if isinstance(queue.get("items"), list) else []
    ledger = []
    for item in items:
        if not isinstance(item, dict):
            continue
        ledger.append(
            {
                "findingId": item.get("id", ""),
                "reviewer": "",
                "reviewedAt": "",
                "outcome": "unreviewed",
                "allowedOutcomes": [
                    "unreviewed",
                    "real-problem",
                    "deliberate-choice",
                    "false-positive",
                    "needs-human-ear",
                    "needs-source-check",
                    "needs-edit-change",
                ],
                "listenNotes": "",
                "visualNotes": "",
                "cadenceNotes": "",
                "sourceMonitorNotes": "",
                "recommendedStatus": "",
                "recommendedStatusOptions": [
                    "listen",
                    "refine",
                    "keep",
                    "hold",
                ],
                "editChangeNeeded": False,
                "editChangeSummary": "",
                "tradeoff": "",
                "followUp": "",
                "sourceSafety": "Do not mutate original source media. If an edit changes, record the decision as metadata/revision notes.",
                "queueItem": item,
            }
        )
    return ledger


def review_notes_template(queue: dict) -> str:
    items = queue.get("items", []) if isinstance(queue.get("items"), list) else []
    lines = [
        "# Cut Rhythm Review Notes",
        "",
        "Use this file while listening through queue items. These notes are review evidence, not publication proof.",
        "",
        "Outcome suggestions:",
        "",
        "- `real-problem`: the finding caught something that hurts the edit.",
        "- `deliberate-choice`: the finding is intentional and should be explained in metadata.",
        "- `false-positive`: the finding is not a problem after listening.",
        "- `needs-human-ear`: Codex cannot decide this confidently.",
        "- `needs-source-check`: source monitor comparison is required.",
        "- `needs-edit-change`: edit metadata should be revised.",
        "",
    ]
    if not items:
        lines.append("No queue items were generated.")
    for item in items:
        if not isinstance(item, dict):
            continue
        lines.extend(
            [
                f"## {item.get('rank', '')}. {item.get('title', '')}",
                "",
                f"- Finding ID: `{item.get('id', '')}`",
                f"- Severity: `{item.get('severity', '')}`",
                f"- Review mode: `{item.get('reviewMode', '')}`",
                f"- First action: {item.get('firstAction', '')}",
                "",
                "### Reviewer notes",
                "",
                "- Reviewer:",
                "- Reviewed at:",
                "- Outcome:",
                "- Listen notes:",
                "- Visual/source monitor notes:",
                "- Cadence notes:",
                "- Recommended status: Listen / Refine / Keep / Hold",
                "- Edit change needed: yes/no",
                "- Tradeoff if changed:",
                "- Follow-up:",
                "",
            ]
        )
    return "\n".join(lines).rstrip() + "\n"


def agent_work_order(audit: dict, queue: dict) -> str:
    counts = audit.get("findingCounts", {}) if isinstance(audit.get("findingCounts"), dict) else {}
    items = queue.get("items", []) if isinstance(queue.get("items"), list) else []
    lines = [
        "# Agent Work Order: Cut Rhythm Review",
        "",
        "You are reviewing rhythm, not proving publication readiness.",
        "",
        "## Non-negotiable boundaries",
        "",
        "- Do not mutate original source media.",
        "- Do not overwrite previous exports.",
        "- Do not publish, upload, schedule, or claim receipt-backed publication.",
        "- Do not auto-fix every finding. Listen first.",
        "- Keep whole source lanes intact. Edits are transparent metadata.",
        "",
        "## Current packet summary",
        "",
        f"- Decisions inspected: {audit.get('decisionCount', 0)}",
        f"- Findings: high={counts.get('high', 0)}, medium={counts.get('medium', 0)}, low={counts.get('low', 0)}, total={counts.get('total', 0)}",
        f"- First focus: {audit.get('firstFocus', '')}",
        "",
        "## Work loop",
        "",
        "For each queue item, in order:",
        "",
        "1. Open `queue.md` and read the item.",
        "2. Use the listed span to scrub/play that moment in Quipsly Studio.",
        "3. Watch Program Output and source monitors together.",
        "4. Listen at normal speed before changing status.",
        "5. Decide whether the finding is a real problem, a deliberate creative choice, or inconclusive.",
        "6. Use the listed status command only after the review pass.",
        "7. If an edit change is needed, preserve whole sources and write the tradeoff in metadata/revision notes.",
        "",
        "## First items",
        "",
    ]
    if not items:
        lines.append("- No queue items were generated. Load/select a session and rerun the packet, or do a normal listen-through.")
    for item in items[:5]:
        if not isinstance(item, dict):
            continue
        lines.extend(
            [
                f"### {item.get('rank', '')}. {item.get('title', '')}",
                "",
                f"- ID: `{item.get('id', '')}`",
                f"- Severity: `{item.get('severity', '')}`",
                f"- Review mode: `{item.get('reviewMode', '')}`",
                f"- First action: {item.get('firstAction', '')}",
                f"- Status command: `{item.get('statusCommand', '')}`",
                "",
            ]
        )
    lines.extend(
        [
            "## Done means",
            "",
            "- Reviewed items have explicit Listen/Refine/Keep/Hold status or notes.",
            "- Any changed edit decision explains the human tradeoff.",
            "- Any uncertainty is marked visibly instead of hidden.",
            "- Nothing is called published without an actual external receipt.",
        ]
    )
    return "\n".join(lines).rstrip() + "\n"


def write_packet(base_url: str, output_root: Path, basename: str, severity: str, limit: int) -> Path:
    stamp = dt.datetime.now(dt.UTC).strftime("%Y%m%dT%H%M%SZ")
    packet_dir = output_root / f"{safe_slug(basename)}-{severity}-{stamp}"
    packet_dir.mkdir(parents=True, exist_ok=False)

    audit = make_audit(base_url)
    queue = make_queue(base_url, limit=limit, severity=severity)

    (packet_dir / "audit.md").write_text(render_audit_markdown(audit), encoding="utf-8")
    (packet_dir / "audit.json").write_text(json.dumps(audit, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (packet_dir / "queue.md").write_text(render_queue_markdown(queue), encoding="utf-8")
    (packet_dir / "queue.json").write_text(json.dumps(queue, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (packet_dir / "README.md").write_text(packet_readme(audit, queue), encoding="utf-8")
    (packet_dir / "AGENT_WORK_ORDER.md").write_text(agent_work_order(audit, queue), encoding="utf-8")
    (packet_dir / "REVIEW_LEDGER_TEMPLATE.json").write_text(
        json.dumps(review_ledger_template(queue), indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    (packet_dir / "REVIEW_NOTES_TEMPLATE.md").write_text(review_notes_template(queue), encoding="utf-8")
    return packet_dir


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create a read-only cut rhythm review packet.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8080")
    parser.add_argument("--output-root", required=True)
    parser.add_argument("--basename", default="cut-rhythm-review-packet")
    parser.add_argument("--severity", choices=("any", "high", "medium", "low"), default="any")
    parser.add_argument("--limit", type=int, default=10)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    packet_dir = write_packet(
        base_url=args.base_url,
        output_root=Path(args.output_root).expanduser(),
        basename=args.basename,
        severity=args.severity,
        limit=max(1, min(args.limit, 50)),
    )
    print(packet_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
