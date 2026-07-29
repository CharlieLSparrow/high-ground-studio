#!/usr/bin/env python3
"""Draft a receipt-safe Keep/Refine/Reject packet for the selected short.

This packet captures the proposed review decision, current selected-short
evidence, and exact follow-up command. It does not apply the decision by
default. It does not edit, export, upload, publish, create receipts, or mutate
source media.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_BASE_URL = "http://127.0.0.1:8080"
DEFAULT_OUTPUT_ROOT = Path("/Volumes/My Passport/Quipsly/QuipslyExports/ShortsReviewDecisionPackets")
SCHEMA = "quipsly.studio.shorts-review-decision-packet.v1"
ALLOWED_DECISIONS = {"keep", "refine", "reject", "hold"}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def slug(value: str, fallback: str = "short-review-decision") -> str:
    text = (value or fallback).lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or fallback


def fetch_json(base_url: str, path: str, timeout: float = 8.0) -> dict[str, Any]:
    url = base_url.rstrip("/") + path
    with urllib.request.urlopen(url, timeout=timeout) as response:
        data = json.loads(response.read().decode("utf-8", errors="replace"))
    if not isinstance(data, dict):
        raise ValueError(f"Expected JSON object from {path}")
    return data


def text(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def number(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return fallback


def command_quote(value: str) -> str:
    # Keep command strings paste-friendly for the repo's existing shell wrapper.
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def decision_guidance(decision: str) -> dict[str, Any]:
    if decision == "keep":
        return {
            "meaning": "Reviewer believes this short is worth moving toward Tower/manual publishing prep.",
            "requiredEvidence": [
                "Watch the export at normal speed.",
                "Confirm the hook/payoff works without episode context.",
                "Confirm crop/caption metadata is not obviously face-hostile.",
                "Remember that Keep is not publication or scheduling approval.",
            ],
            "nextAfterApply": "Draft or verify platform packet, then capture human publishing approval separately.",
        }
    if decision == "refine":
        return {
            "meaning": "Reviewer sees promise but wants an edit/caption/framing/cadence change before handoff.",
            "requiredEvidence": [
                "Name the specific issue: hook, pacing, caption, framing, cadence, sync, or payoff.",
                "Prefer boundary nudge, reaction cover, J-cut/L-cut, or caption fix over generic 'make better'.",
                "Keep source media whole and refine metadata only.",
            ],
            "nextAfterApply": "Create a targeted refinement note or new versioned recipe; do not overwrite existing proof.",
        }
    if decision == "reject":
        return {
            "meaning": "Reviewer does not think this short is worth this batch.",
            "requiredEvidence": [
                "Name why it fails: weak hook, no payoff, bad framing, cadence damage, context loss, or duplicate idea.",
                "Rejecting a short does not delete the source or erase the recipe.",
            ],
            "nextAfterApply": "Move to the next candidate; preserve recipe history for learning.",
        }
    return {
        "meaning": "Reviewer needs more context or wants to park the short without judging it.",
        "requiredEvidence": [
            "Name the missing information or uncertainty.",
            "Hold is reversible and is not a negative quality score.",
        ],
        "nextAfterApply": "Resolve the uncertainty, then re-review.",
    }


def build_packet(args: argparse.Namespace) -> dict[str, Any]:
    decision = args.decision.lower().strip()
    if decision not in ALLOWED_DECISIONS:
        raise SystemExit(f"Unsupported decision {args.decision!r}. Use one of: {', '.join(sorted(ALLOWED_DECISIONS))}")
    quality = fetch_json(args.base_url, "/selected_short_quality")
    state = fetch_json(args.base_url, "/state")
    selected_id = text(quality.get("selectedShortId"))
    title = text(quality.get("title"))
    if not selected_id:
        raise SystemExit("No selected short is available. Use shorts-select-wait before drafting a decision packet.")

    notes = text(args.notes)
    apply_command = f"script/agentctl.sh shorts-review-selected {decision} {command_quote(notes or decision_guidance(decision)['meaning'])}"
    packet = {
        "schema": SCHEMA,
        "status": "shorts_review_decision_packet",
        "generatedAt": iso_now(),
        "activeSessionName": text(state.get("activeSessionName")),
        "decision": decision,
        "notes": notes,
        "selectedShort": {
            "id": selected_id,
            "title": title,
            "durationSeconds": number(quality.get("recipeDuration")),
            "reviewStatusBefore": text(quality.get("reviewStatus")),
            "exportStatus": text(quality.get("exportStatus")),
            "reviewClassLabel": text(quality.get("reviewClassLabel")),
            "sequenceStart": number(quality.get("sequenceStart")),
            "sequenceEnd": number(quality.get("sequenceEnd")),
            "primaryPlatform": text(quality.get("primaryPlatform")),
        },
        "reviewChecklist": quality.get("reviewChecklist") if isinstance(quality.get("reviewChecklist"), list) else [],
        "cutIntelligenceEvidence": quality.get("cutIntelligenceEvidence") if isinstance(quality.get("cutIntelligenceEvidence"), dict) else {},
        "platformVariantCount": len(quality.get("platformVariants")) if isinstance(quality.get("platformVariants"), list) else 0,
        "guidance": decision_guidance(decision),
        "safeCommands": {
            "applyDecision": apply_command,
            "selectedQuality": "script/agentctl.sh selected-short-quality",
            "selectedBrief": "script/agentctl.sh shorts-review-brief --markdown",
            "reviewQueuePacket": "script/agentctl.sh shorts-review-queue-packet --save --markdown",
            "platformPacket": "script/agentctl.sh selected-short-platform-packet --all",
        },
        "truth": (
            "Review decision packet only. It does not apply the decision unless the applyDecision command is run separately. "
            "It does not edit, export, upload, publish, create receipts, or mutate source media."
        ),
    }
    if args.save:
        folder = args.output_root / slug(str(packet["activeSessionName"]) or "unknown-session") / f"{stamp()}-{decision}-{slug(title)}"
        folder.mkdir(parents=True, exist_ok=False)
        json_path = folder / "shorts-review-decision-packet.json"
        markdown_path = folder / "shorts-review-decision-packet.md"
        json_path.write_text(json.dumps(packet, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        markdown_path.write_text(markdown(packet) + "\n", encoding="utf-8")
        packet["artifact"] = {"jsonPath": str(json_path), "markdownPath": str(markdown_path)}
    return packet


def markdown(packet: dict[str, Any]) -> str:
    selected = packet["selectedShort"]
    guidance = packet["guidance"]
    lines = [
        "# Shorts Review Decision Packet",
        "",
        f"- Session: `{packet['activeSessionName'] or 'unknown'}`",
        f"- Short: **{selected['title']}**",
        f"- ID: `{selected['id']}`",
        f"- Proposed decision: `{packet['decision']}`",
        f"- Current review status: `{selected['reviewStatusBefore'] or 'unknown'}`",
        f"- Export status: `{selected['exportStatus'] or 'unknown'}`",
        f"- Duration: `{selected['durationSeconds']:.1f}s`",
        f"- Notes: {packet['notes'] or 'No notes supplied.'}",
        "",
        "## What this decision means",
        "",
        guidance["meaning"],
        "",
        "## Evidence to check",
        "",
    ]
    for item in guidance["requiredEvidence"]:
        lines.append(f"- {item}")
    lines.extend([
        "",
        "## Next after applying",
        "",
        guidance["nextAfterApply"],
        "",
        "## Commands",
        "",
    ])
    for label, command in packet["safeCommands"].items():
        lines.append(f"- `{label}`: `{command}`")
    if packet.get("artifact"):
        lines.extend([
            "",
            "## Saved artifact",
            "",
            f"- JSON: `{packet['artifact']['jsonPath']}`",
            f"- Markdown: `{packet['artifact']['markdownPath']}`",
        ])
    lines.extend(["", f"Truth: {packet['truth']}"])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("decision", choices=sorted(ALLOWED_DECISIONS))
    parser.add_argument("notes", nargs="?", default="")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--save", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    args = parser.parse_args()

    packet = build_packet(args)
    if args.markdown and not args.json:
        print(markdown(packet))
    else:
        print(json.dumps(packet, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
