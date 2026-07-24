#!/usr/bin/env python3
"""Prepare or launch the Episode 1 artifact-review handoff evidence.

This is an operator convenience layer over the handoff bundle. It can print a
review plan and, when explicitly requested, open the local review station and
contact sheets. It does not record decisions.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from typing import Any


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def load_json(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: str, payload: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")


def maybe_open(path: str | None) -> dict[str, Any]:
    if not path:
        return {"path": path, "opened": False, "reason": "missing path"}
    if not os.path.exists(path):
        return {"path": path, "opened": False, "reason": "file does not exist"}
    result = subprocess.run(["open", path], capture_output=True, text=True, check=False)
    return {
        "path": path,
        "opened": result.returncode == 0,
        "exitCode": result.returncode,
        "stderrTail": result.stderr[-1000:],
    }


def markdown(packet: dict[str, Any]) -> str:
    lines = [
        "# Episode 1 artifact review launch plan",
        "",
        f"Generated: {packet['generatedAt']}",
        "",
        f"Current state: `{packet['currentState']}`",
        "",
        packet["plainEnglishState"],
        "",
        "## Open first",
        "",
        f"- Review station: `{packet['reviewStationHtml']}`",
        "",
        "## Inspect focused ending samples",
        "",
    ]
    for item in packet["focusedEndingSamples"]:
        lines.append(f"- `{item['artifactId']}`: `{item['path']}`")
    if not packet["focusedEndingSamples"]:
        lines.append("- No focused ending samples found.")
    lines.extend(["", "## Inspect contact sheets", ""])
    for item in packet["contactSheets"]:
        lines.append(f"- `{item['artifactId']}`: `{item['path']}`")
    if not packet["contactSheets"]:
        lines.append("- No contact sheets found.")
    lines.extend(
        [
            "",
            "## Decision after review",
            "",
            f"- Select candidate: `{packet['safeCommands'].get('selectTailTrimCandidateForReview')}`",
            f"- Reject candidate: `{packet['safeCommands'].get('rejectTailTrimCandidate')}`",
            "",
            "## Do not claim yet",
            "",
        ]
    )
    for claim in packet["blockedClaims"]:
        lines.append(f"- {claim}")
    lines.extend(["", "## Truth boundary", "", packet["truth"], ""])
    return "\n".join(lines)


def main() -> int:
    if len(sys.argv) != 5:
        print(
            "usage: episode1_artifact_review_launcher.py handoff.json output.json output.md --plan|--open",
            file=sys.stderr,
        )
        return 2

    handoff_path, output_json, output_md, mode = sys.argv[1:5]
    if mode not in {"--plan", "--open"}:
        print("mode must be --plan or --open", file=sys.stderr)
        return 2

    handoff = load_json(handoff_path)
    focused_samples = [
        {
            "artifactId": item.get("artifactId"),
            "path": item.get("endingSamplePath"),
            "exists": bool(item.get("endingSampleExists")),
        }
        for item in handoff.get("tailTrimCandidateArtifacts") or []
        if item.get("endingSamplePath")
    ]
    contact_sheets = [
        {
            "artifactId": item.get("artifactId"),
            "path": item.get("contactSheetPath"),
            "exists": bool(item.get("exists")),
        }
        for item in handoff.get("contactSheets") or []
        if item.get("contactSheetPath")
    ]
    packet = {
        "packetType": "quipsly-episode1-artifact-review-launch-plan",
        "version": "2026-06-20.artifact-review-launcher.v1",
        "projectSlug": handoff.get("projectSlug"),
        "episodeSlug": handoff.get("episodeSlug"),
        "generatedAt": now_iso(),
        "mode": mode,
        "currentState": handoff.get("currentState"),
        "plainEnglishState": handoff.get("plainEnglishState"),
        "sourceHandoff": handoff_path,
        "reviewStationHtml": handoff.get("reviewStationHtml"),
        "focusedEndingSamples": focused_samples,
        "contactSheets": contact_sheets,
        "safeCommands": handoff.get("safeCommands") or {},
        "blockedClaims": handoff.get("blockedClaims") or [],
        "openResults": [],
        "truth": "This launch plan opens or lists review evidence only. It does not select candidates, approve artifacts, publish, upload, schedule, or capture receipts.",
    }

    if mode == "--open":
        packet["openResults"].append(maybe_open(packet["reviewStationHtml"]))
        for item in contact_sheets:
            packet["openResults"].append(maybe_open(item.get("path")))

    write_json(output_json, packet)
    os.makedirs(os.path.dirname(output_md) or ".", exist_ok=True)
    with open(output_md, "w", encoding="utf-8") as handle:
        handle.write(markdown(packet))
    print(
        json.dumps(
            {
                "packetType": "quipsly-episode1-artifact-review-launcher-result",
                "status": packet["currentState"],
                "mode": mode,
                "output": output_json,
                "markdown": output_md,
                "openedCount": sum(1 for item in packet["openResults"] if item.get("opened")),
                "truth": packet["truth"],
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
