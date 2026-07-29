#!/usr/bin/env python3
"""Render a read-only selected-decision review brief from Quipsly Studio.

The selected decision is where Quipsly's editing philosophy has to become
visible: whole sources stay intact, cut intent is metadata, and review history
explains why a decision exists before anyone trusts it.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from typing import Any


def fetch_json(base_url: str, path: str) -> dict[str, Any]:
    url = base_url.rstrip("/") + path
    try:
        with urllib.request.urlopen(url, timeout=8) as response:
            return json.loads(response.read().decode("utf-8", errors="replace"))
    except Exception as exc:  # noqa: BLE001 - operator-facing helper.
        return {
            "status": "request_failed",
            "url": url,
            "error": str(exc),
            "truth": "Read-only request failed before any edit, export, publish, or source-media mutation.",
        }


def string_value(value: Any, default: str = "") -> str:
    if value is None:
        return default
    if isinstance(value, str):
        return value
    return str(value)


def list_value(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def dict_value(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def make_brief(base_url: str) -> dict[str, Any]:
    evidence = fetch_json(base_url, "/selected_decision_intent_evidence")
    provenance = dict_value(evidence.get("reviewProvenance"))
    ledger = list_value(evidence.get("revisionLedger"))
    recommended_review_mode = dict_value(evidence.get("recommendedReviewMode"))
    cadence_guard = dict_value(evidence.get("cadenceGuard"))
    safe_commands = dict_value(evidence.get("safeCommands"))

    return {
        "status": "selected_decision_review_brief",
        "model": "quipslystudio-selected-decision-review-brief",
        "baseUrl": base_url.rstrip("/"),
        "selectedDecisionStatus": evidence.get("status", ""),
        "selectedLaneName": evidence.get("selectedLaneName", ""),
        "selectedTagId": evidence.get("selectedTagId", ""),
        "selectedTagType": evidence.get("selectedTagType", ""),
        "selectedTagStart": evidence.get("selectedTagStart", 0),
        "selectedTagDuration": evidence.get("selectedTagDuration", 0),
        "cutStyle": evidence.get("cutStyle", ""),
        "coverStrategy": evidence.get("coverStrategy", ""),
        "cadenceMode": evidence.get("cadenceMode", ""),
        "techniqueTradeoffExplanation": evidence.get("techniqueTradeoffExplanation", ""),
        "techniqueReviewQuestion": evidence.get("techniqueReviewQuestion", ""),
        "agentTechniqueRule": evidence.get("agentTechniqueRule", ""),
        "preservationWarning": evidence.get("preservationWarning", ""),
        "recommendedReviewMode": recommended_review_mode,
        "cadenceGuard": cadence_guard,
        "humanReviewChecklist": list_value(evidence.get("humanReviewChecklist")),
        "reviewEvidence": list_value(evidence.get("reviewEvidence")),
        "nextReviewAction": evidence.get("nextReviewAction", ""),
        "reviewProvenance": provenance,
        "revisionLedger": ledger,
        "safeCommands": safe_commands,
        "truth": "Read-only selected-decision brief. It does not approve, apply, export, publish, trim, delete, or mutate source media.",
    }


def render_markdown(brief: dict[str, Any]) -> str:
    ledger = list_value(brief.get("revisionLedger"))
    provenance = dict_value(brief.get("reviewProvenance"))
    recommended_review_mode = dict_value(brief.get("recommendedReviewMode"))
    cadence_guard = dict_value(brief.get("cadenceGuard"))
    latest = dict_value(provenance.get("latestStructuredRevision"))

    lines: list[str] = [
        "# Quipsly Selected Decision Brief",
        "",
        f"- Status: `{brief.get('selectedDecisionStatus', '')}`",
        f"- Base URL: `{brief.get('baseUrl', '')}`",
        f"- Truth: {brief.get('truth', '')}",
        "",
        "## Selected decision",
        "",
        f"- Lane: {brief.get('selectedLaneName', '')}",
        f"- Tag ID: `{brief.get('selectedTagId', '')}`",
        f"- Type: {brief.get('selectedTagType', '')}",
        f"- Start: {brief.get('selectedTagStart', 0)}",
        f"- Duration: {brief.get('selectedTagDuration', 0)}",
        f"- Cut style: {brief.get('cutStyle', '')}",
        f"- Cover strategy: {brief.get('coverStrategy', '')}",
        f"- Cadence mode: {brief.get('cadenceMode', '')}",
        "",
    ]

    if recommended_review_mode:
        lines.extend([
            "## Recommended review mode",
            "",
            f"- Mode: `{recommended_review_mode.get('mode', '')}`",
            f"- Label: {recommended_review_mode.get('label', '')}",
            f"- Reason: {recommended_review_mode.get('reason', '')}",
            f"- First action: {recommended_review_mode.get('firstAction', '')}",
            f"- Risk level: {recommended_review_mode.get('riskLevel', '')}",
            "",
        ])

    if cadence_guard:
        lines.extend([
            "## Cadence guard",
            "",
            f"- Title: {cadence_guard.get('title', '')}",
            f"- Detail: {cadence_guard.get('detail', '')}",
            f"- Preserve air: {cadence_guard.get('preserveAir', '')}",
            f"- Risk level: {cadence_guard.get('riskLevel', '')}",
            "",
        ])

    lines.extend([
        "## Why this needs review",
        "",
        f"- Tradeoff: {brief.get('techniqueTradeoffExplanation', '')}",
        f"- Review question: {brief.get('techniqueReviewQuestion', '')}",
        f"- Codex rule: {brief.get('agentTechniqueRule', '')}",
        f"- Preservation warning: {brief.get('preservationWarning', '')}",
        f"- Next review action: {brief.get('nextReviewAction', '')}",
        "",
        "## Human review checklist",
        "",
    ]
    checklist = list_value(brief.get("humanReviewChecklist"))
    lines.extend(f"- {item}" for item in (checklist or ["Cue this boundary and listen before marking Keep, Refine, or Hold."]))

    lines.extend(["", "## Review evidence", ""])
    evidence = list_value(brief.get("reviewEvidence"))
    lines.extend(f"- {item}" for item in (evidence or ["No concrete evidence recorded yet. Add a decision note after listening."]))

    lines.extend([
        "",
        "## Review provenance",
        "",
        f"- Structured revisions: {provenance.get('structuredRevisionCount', len(ledger))}",
        f"- Legacy revisions: {provenance.get('legacyRevisionCount', 0)}",
    ])
    if latest:
        lines.extend([
            f"- Latest actor: {latest.get('actor', '')} ({latest.get('actorType', '')})",
            f"- Latest action: {latest.get('action', '')}",
            f"- Latest note: {latest.get('note', '')}",
            f"- Latest status: {latest.get('previousStatus', '')} -> {latest.get('nextStatus', '')}",
        ])

    if ledger:
        lines.extend(["", "### Ledger tail", ""])
        for item in ledger[-5:]:
            if not isinstance(item, dict):
                continue
            evidence_items = list_value(item.get("evidence"))
            evidence_line = f" Evidence: {evidence_items[0]}" if evidence_items else ""
            lines.append(
                f"- `{item.get('action', 'noted')}` by {item.get('actor', 'Unknown')} "
                f"({item.get('actorType', 'unknown')}): {item.get('note', '')}{evidence_line}"
            )

    safe_commands = dict_value(brief.get("safeCommands"))
    if safe_commands:
        lines.extend(["", "## Safe next commands", ""])
        for key, value in safe_commands.items():
            lines.append(f"- {key}: `{value}`")

    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a selected-decision review brief from Quipsly Studio.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8080")
    parser.add_argument("--json", action="store_true", help="Print JSON instead of Markdown.")
    parser.add_argument("--markdown", action="store_true", help="Print Markdown. Default.")
    args = parser.parse_args()

    brief = make_brief(args.base_url)
    if args.json:
        print(json.dumps(brief, indent=2, sort_keys=True))
    else:
        print(render_markdown(brief))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
