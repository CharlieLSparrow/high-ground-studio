#!/usr/bin/env python3
"""Select the next Studio short evidence draft to act on.

The evidence-draft index shows the map. This selector points to the next safest
draft: pending in the local review ledger, specific enough for dry-run or
recorded-intent consideration, and still explicitly non-publishing.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_INDEX_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "recommended-review-packets"
    / "evidence-draft-index"
    / "quipsly-studio-short-evidence-draft-index.json"
)
SCHEMA = "quipsly.studio.short-evidence-draft-next.v1"


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"Evidence-draft index not found: {path}\nRun: script/agentctl.sh studio-short-evidence-draft-index")
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def select_draft(rows: list[dict[str, Any]], short_id: str, draft_id: str) -> dict[str, Any]:
    if draft_id:
        selected = next((row for row in rows if str(row.get("draftId")) == draft_id), None)
        if selected:
            return selected
        raise SystemExit(f"Draft id not found in evidence-draft index: {draft_id}")
    if short_id:
        candidates = [row for row in rows if str(row.get("shortId")) == short_id]
        if not candidates:
            raise SystemExit(f"Short id not found in evidence-draft index: {short_id}")
        return sorted(candidates, key=lambda row: str(row.get("generatedAt") or row.get("draftId") or ""), reverse=True)[0]

    priority_groups = [
        lambda row: row.get("ledgerDecision") == "pending" and bool(row.get("specificEnoughForRecordedIntent")),
        lambda row: row.get("ledgerDecision") == "pending" and bool(row.get("specificEnoughForDryRun")),
        lambda row: row.get("ledgerDecision") == "pending",
        lambda row: True,
    ]
    for predicate in priority_groups:
        matches = [row for row in rows if predicate(row)]
        if matches:
            return sorted(
                matches,
                key=lambda row: (
                    int(row.get("specificEnoughForRecordedIntent") is True),
                    int(row.get("specificEnoughForDryRun") is True),
                    str(row.get("generatedAt") or row.get("draftId") or ""),
                ),
                reverse=True,
            )[0]
    raise SystemExit("Evidence-draft index has no drafts.")


def next_action(row: dict[str, Any]) -> str:
    if row.get("ledgerDecision") != "pending":
        return "Ledger already has a local decision. Compare the draft against the recorded decision before changing anything."
    if row.get("specificEnoughForRecordedIntent"):
        return "Run the dry-run command and inspect the preview. If it still matches the evidence, a human/agent may record local intent next."
    if row.get("specificEnoughForDryRun"):
        return "Run the dry-run command as a preview, but add more evidence before recording local intent."
    return "Open the draft or packet and add more specific watch/listen evidence before dry-running."


def build_payload(index: dict[str, Any], index_path: Path, row: dict[str, Any]) -> dict[str, Any]:
    html_path = str(row.get("htmlPath") or "")
    dry_run = str(row.get("suggestedDryRunCommand") or "")
    record_template = str(row.get("recordedIntentCommandTemplate") or "")
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "sourceIndexJson": str(index_path),
        "sourceIndexHtml": str(index_path.with_suffix(".html")),
        "sourceIndexCounts": index.get("counts", {}),
        "selected": {
            "draftId": row.get("draftId"),
            "shortId": row.get("shortId"),
            "episode": row.get("episode"),
            "version": row.get("version"),
            "title": row.get("title"),
            "outcome": row.get("outcome"),
            "status": row.get("status"),
            "reviewer": row.get("reviewer"),
            "confidence": row.get("confidence"),
            "summary": row.get("summary"),
            "filledDimensionCount": row.get("filledDimensionCount"),
            "totalEvidenceWords": row.get("totalEvidenceWords"),
            "specificEnoughForDryRun": row.get("specificEnoughForDryRun"),
            "specificEnoughForRecordedIntent": row.get("specificEnoughForRecordedIntent"),
            "ledgerDecision": row.get("ledgerDecision"),
            "specificityNote": row.get("specificityNote"),
            "htmlPath": html_path,
            "jsonPath": row.get("jsonPath"),
            "markdownPath": row.get("markdownPath"),
        },
        "safeCommands": {
            "openIndex": f"open {shell_quote(str(index_path.with_suffix('.html')))}",
            "openDraft": f"open {shell_quote(html_path)}" if html_path else "",
            "dryRunDecision": dry_run,
            "recordIntentTemplate": record_template,
        },
        "nextSafestAction": next_action(row),
        "truth": "Read-only evidence-draft routing. No review decision, approval, publication, upload, schedule, account mutation, media mutation, overwrite, delete, or receipt truth is created.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    selected = payload["selected"]
    lines = [
        "# Next short evidence draft",
        "",
        f"Generated: `{payload.get('generatedAt')}`",
        "",
        f"## {selected.get('draftId')}",
        "",
        f"- Short: `{selected.get('shortId')}`",
        f"- Episode/version: `Episode {selected.get('episode')}` / `{selected.get('version')}`",
        f"- Outcome: `{selected.get('outcome')}`",
        f"- Status: `{selected.get('status')}`",
        f"- Ledger decision: `{selected.get('ledgerDecision')}`",
        f"- Specific enough for dry-run: `{selected.get('specificEnoughForDryRun')}`",
        f"- Specific enough for recorded intent: `{selected.get('specificEnoughForRecordedIntent')}`",
        f"- Filled dimensions: `{selected.get('filledDimensionCount')}`",
        f"- Evidence words: `{selected.get('totalEvidenceWords')}`",
        f"- Summary: {selected.get('summary') or 'none'}",
        "",
        f"Next safest action: {payload.get('nextSafestAction')}",
        "",
        "## Safe commands",
        "",
    ]
    for label, command in payload.get("safeCommands", {}).items():
        if command:
            lines.append(f"- {label}: `{command}`")
    lines.extend(["", "## Truth boundary", "", payload.get("truth", "")])
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Select the next Studio short evidence draft.")
    parser.add_argument("--index", default=str(DEFAULT_INDEX_JSON), help="Evidence-draft index JSON.")
    parser.add_argument("--short-id", default="", help="Select latest draft for a specific short.")
    parser.add_argument("--draft-id", default="", help="Select a specific draft id.")
    parser.add_argument("--format", choices=["markdown", "json"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    args = parser.parse_args()

    index_path = Path(args.index).expanduser()
    index = read_json(index_path)
    rows = [row for row in index.get("latestByShort", []) if isinstance(row, dict)]
    if args.draft_id:
        rows = [row for row in index.get("drafts", []) if isinstance(row, dict)]
    payload = build_payload(index, index_path, select_draft(rows, args.short_id, args.draft_id))
    if args.format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(payload), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
