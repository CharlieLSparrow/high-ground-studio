#!/usr/bin/env python3
"""Save a selected-decision review packet.

Creates a timestamped folder containing the selected decision state contract,
human cut guidance, and production brief. This is a read-only handoff artifact:
it does not edit, export, publish, relink, or mutate source media.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_BASE_URL = "http://127.0.0.1:8765"
DEFAULT_OUTPUT_ROOT = Path.home() / "Movies" / "QuipslyExports" / "DecisionReviewPackets"


def run_command(command: list[str]) -> dict[str, Any]:
    completed = subprocess.run(command, capture_output=True, text=True, check=False)
    return {
        "command": command,
        "returnCode": completed.returncode,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
        "ok": completed.returncode == 0,
    }


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def build_packet(output_root: Path, basename: str, base_url: str, json_only: bool) -> dict[str, Any]:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    packet_dir = output_root / f"{basename}-{timestamp}"
    packet_dir.mkdir(parents=True, exist_ok=False)

    format_flag = "--json" if json_only else "--markdown"
    extension = "json" if json_only else "md"
    commands = {
        "stateContract": [
            sys.executable,
            str(SCRIPT_DIR / "selected_decision_state_contract_check.py"),
            "--base-url",
            base_url,
            format_flag,
        ],
        "humanCutGuidance": [
            sys.executable,
            str(SCRIPT_DIR / "selected_decision_human_cut_guidance.py"),
            "--base-url",
            base_url,
            format_flag,
        ],
        "productionBrief": [
            sys.executable,
            str(SCRIPT_DIR / "selected_decision_production_brief.py"),
            "--base-url",
            base_url,
            format_flag,
        ],
    }

    results: dict[str, Any] = {}
    for label, command in commands.items():
        result = run_command(command)
        results[label] = {
            "command": " ".join(command),
            "returnCode": result["returnCode"],
            "ok": result["ok"],
            "stderr": result["stderr"].strip(),
        }
        body = result["stdout"] if result["stdout"].strip() else result["stderr"]
        write_text(packet_dir / f"{label}.{extension}", body)

    manifest = {
        "ok": all(result["ok"] for result in results.values()),
        "model": "quipsly-selected-decision-review-packet",
        "version": "2026-06-30.selected-decision-review-packet.v1",
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "baseUrl": base_url,
        "packetDir": str(packet_dir),
        "artifacts": {
            label: str(packet_dir / f"{label}.{extension}")
            for label in commands
        },
        "results": results,
        "truth": "Read-only selected decision review packet. It does not approve, edit, export, publish, relink, or mutate source media.",
    }
    write_text(packet_dir / "manifest.json", json.dumps(manifest, indent=2, sort_keys=True) + "\n")

    if not json_only:
        index_lines = [
            "# Selected decision review packet",
            "",
            f"- Generated: {manifest['generatedAt']}",
            f"- Base URL: `{base_url}`",
            f"- Packet folder: `{packet_dir}`",
            f"- All commands succeeded: `{manifest['ok']}`",
            "",
            "## Artifacts",
            "",
            f"- State contract: `{packet_dir / 'stateContract.md'}`",
            f"- Human cut guidance: `{packet_dir / 'humanCutGuidance.md'}`",
            f"- Production brief: `{packet_dir / 'productionBrief.md'}`",
            f"- Manifest: `{packet_dir / 'manifest.json'}`",
            "",
            f"Truth: {manifest['truth']}",
        ]
        write_text(packet_dir / "README.md", "\n".join(index_lines) + "\n")

    return manifest


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output_root", nargs="?", default=str(DEFAULT_OUTPUT_ROOT))
    parser.add_argument("basename", nargs="?", default="selected-decision-review-packet")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--json", action="store_true", help="save JSON artifacts instead of Markdown where supported")
    args = parser.parse_args(argv)

    try:
        manifest = build_packet(Path(args.output_root).expanduser(), args.basename, args.base_url, args.json)
    except Exception as exc:  # noqa: BLE001 - diagnostic CLI.
        payload = {
            "ok": False,
            "error": f"Could not save selected-decision review packet: {exc}",
            "truth": "Diagnostic failure only; no source media or edit metadata changed.",
        }
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 1

    print(manifest["packetDir"])
    return 0 if manifest["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
