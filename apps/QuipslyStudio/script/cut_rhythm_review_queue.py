#!/usr/bin/env python3
"""Create a read-only review queue from the Quipsly cut rhythm audit.

The audit explains what may be wrong. This queue answers the next practical
question: what should a human or agent inspect first, and what safe status
command should they use after listening?
"""

from __future__ import annotations

import argparse
import json
from typing import Any

from cut_rhythm_audit import make_audit


SEVERITY_WEIGHT = {
    "high": 100,
    "medium": 50,
    "low": 10,
}

KIND_WEIGHT = {
    "multi_source_ambiguity": 30,
    "same_source_jump_cut": 25,
    "jl_cut_candidate": 20,
    "cadence_chip": 18,
    "visual_flash": 12,
    "long_skip": 8,
    "long_single_source_run": 5,
}


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


def finding_score(finding: dict[str, Any]) -> int:
    severity = string_value(finding.get("severity"))
    kind = string_value(finding.get("kind"))
    return SEVERITY_WEIGHT.get(severity, 0) + KIND_WEIGHT.get(kind, 0)


def queue_item(finding: dict[str, Any], index: int) -> dict[str, Any]:
    action = dict_value(finding.get("reviewAction"))
    decisions = list_value(finding.get("decisions"))
    spans = []
    for decision in decisions:
        if not isinstance(decision, dict):
            continue
        spans.append(
            {
                "lane": decision.get("lane", ""),
                "type": decision.get("type", ""),
                "start": decision.get("start", 0),
                "end": decision.get("end", 0),
                "duration": decision.get("duration", 0),
            }
        )
    return {
        "rank": index,
        "id": finding.get("id", f"rhythm-{index:03d}"),
        "score": finding_score(finding),
        "severity": finding.get("severity", ""),
        "kind": finding.get("kind", ""),
        "title": finding.get("title", ""),
        "why": finding.get("why", ""),
        "recommendation": finding.get("recommendation", ""),
        "reviewMode": action.get("mode", ""),
        "label": action.get("label", ""),
        "firstAction": action.get("firstAction", ""),
        "statusCommand": action.get("statusCommand", ""),
        "spans": spans,
        "truth": "Queue item only. It does not edit, approve, export, publish, delete, or mutate source media.",
    }


def make_queue(base_url: str, limit: int, severity: str) -> dict[str, Any]:
    audit = make_audit(base_url)
    findings = [item for item in list_value(audit.get("findings")) if isinstance(item, dict)]
    if severity != "any":
        findings = [item for item in findings if item.get("severity") == severity]
    findings = sorted(findings, key=finding_score, reverse=True)
    items = [queue_item(finding, index) for index, finding in enumerate(findings[:limit], start=1)]
    return {
        "status": "cut_rhythm_review_queue",
        "model": "quipslystudio-cut-rhythm-review-queue-v1",
        "baseUrl": base_url.rstrip("/"),
        "filter": {
            "severity": severity,
            "limit": limit,
        },
        "auditSummary": {
            "decisionCount": audit.get("decisionCount", 0),
            "findingCounts": audit.get("findingCounts", {}),
            "firstFocus": audit.get("firstFocus", ""),
        },
        "items": items,
        "emptyState": "No matching rhythm findings. Select/load a session, run the audit again, or use normal listen-through review."
        if not items
        else "",
        "safeCommands": {
            "audit": "script/agentctl.sh cut-rhythm-audit --markdown",
            "saveAudit": "script/agentctl.sh cut-rhythm-audit-save",
            "saveQueue": "script/agentctl.sh cut-rhythm-review-queue-save",
            "cockpit": "script/agentctl.sh editor-review-cockpit --markdown",
        },
        "truth": "Read-only review queue derived from the rhythm audit. It does not edit, approve, export, publish, delete, or mutate source media.",
    }


def render_markdown(queue: dict[str, Any]) -> str:
    summary = dict_value(queue.get("auditSummary"))
    counts = dict_value(summary.get("findingCounts"))
    items = list_value(queue.get("items"))
    safe_commands = dict_value(queue.get("safeCommands"))
    lines = [
        "# Quipsly Cut Rhythm Review Queue",
        "",
        f"- Status: `{queue.get('status', '')}`",
        f"- Truth: {queue.get('truth', '')}",
        f"- Decisions inspected: {summary.get('decisionCount', 0)}",
        f"- Findings: high={counts.get('high', 0)}, medium={counts.get('medium', 0)}, low={counts.get('low', 0)}, total={counts.get('total', 0)}",
        f"- First focus: {summary.get('firstFocus', '')}",
        "",
        "## Queue",
        "",
    ]
    if not items:
        lines.append(f"- {queue.get('emptyState', '')}")
    for item in items:
        spans = list_value(item.get("spans"))
        lines.extend(
            [
                f"### {item.get('rank', '')}. {item.get('title', '')}",
                "",
                f"- ID: `{item.get('id', '')}`",
                f"- Severity: `{item.get('severity', '')}`",
                f"- Kind: `{item.get('kind', '')}`",
                f"- Review mode: `{item.get('reviewMode', '')}`",
                f"- First action: {item.get('firstAction', '')}",
                f"- Why: {item.get('why', '')}",
                f"- Recommendation: {item.get('recommendation', '')}",
                f"- Status command: `{item.get('statusCommand', '')}`",
            ]
        )
        for span in spans:
            if not isinstance(span, dict):
                continue
            lines.append(
                f"- Span: `{span.get('lane', '')}` {span.get('start', '')} -> {span.get('end', '')} "
                f"({span.get('duration', '')}s, {span.get('type', '')})"
            )
        lines.append("")
    if safe_commands:
        lines.extend(["## Safe next commands", ""])
        for key, command in safe_commands.items():
            lines.append(f"- `{key}`: `{command}`")
    return "\n".join(lines).rstrip() + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render a read-only rhythm review queue.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8080")
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--severity", choices=("any", "high", "medium", "low"), default="any")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    limit = max(1, min(args.limit, 50))
    queue = make_queue(args.base_url, limit=limit, severity=args.severity)
    if args.json and not args.markdown:
        print(json.dumps(queue, indent=2, sort_keys=True))
    else:
        print(render_markdown(queue))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
