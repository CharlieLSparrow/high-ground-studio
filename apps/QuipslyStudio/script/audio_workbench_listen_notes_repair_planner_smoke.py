#!/usr/bin/env python3
"""Smoke-test the listen-notes repair planner without mutating real audio gates."""

from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


LISTEN_PRIORITY_SCHEMA = "quipsly.audio-workbench.listen-priority-notes.v1"
MARKER_REVIEW_SCHEMA = "quipsly.audio-workbench.marker-review-notes.v1"
CONTROL_ROOM_SCHEMA = "quipsly.audio-workbench.human-listen-control-room-notes.v1"


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    if (input_path / "manifest.json").exists():
        return input_path.expanduser().resolve()
    nested = input_path / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.expanduser().resolve()
    raise FileNotFoundError(f"Could not find baseline manifest under {input_path}")


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def safe_slug(value: str) -> str:
    out = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in value.lower())
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def make_baseline(real_manifest: dict[str, Any], temp_root: Path, name: str) -> Path:
    baseline_dir = temp_root / name / "baseline"
    baseline_dir.mkdir(parents=True)
    manifest = json.loads(json.dumps(real_manifest))
    manifest["outputs"] = {}
    write_json(baseline_dir / "manifest.json", manifest)
    return baseline_dir


def listen_packet(baseline_id: str, decisions: list[str], *, wrong_baseline: bool = False) -> dict[str, Any]:
    return {
        "schema": LISTEN_PRIORITY_SCHEMA,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "baselineId": baseline_id + "-wrong" if wrong_baseline else baseline_id,
        "items": [
            {
                "id": f"listen-{index}",
                "label": f"Listen item {index}",
                "timecode": f"00:{index:02d}:00.000",
                "sequenceStartSeconds": float(index * 60),
                "durationSeconds": 10.0,
                "decision": decision,
                "notes": f"synthetic {decision}",
            }
            for index, decision in enumerate(decisions, start=1)
        ],
        "overallNotes": "synthetic listen-priority notes",
        "suggestedDecision": "pending-human-listen",
    }


def marker_packet(baseline_id: str, decisions: list[str]) -> dict[str, Any]:
    return {
        "schema": MARKER_REVIEW_SCHEMA,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "baselineId": baseline_id,
        "markers": [
            {
                "id": f"marker-{index}",
                "label": f"Marker item {index}",
                "sequenceStartSeconds": float(index * 120),
                "durationSeconds": 8.0,
                "decision": decision,
                "notes": f"synthetic marker {decision}",
            }
            for index, decision in enumerate(decisions, start=1)
        ],
        "suggestedDecision": "pending-human-listen",
    }


def control_room_packet(baseline_id: str, decisions: list[str]) -> dict[str, Any]:
    if any(decision in {"needs-repair", "fail", "failed"} for decision in decisions):
        suggested = "needs-repair"
    elif any(decision in {"needs-proof", "more-proof"} for decision in decisions):
        suggested = "needs-proof"
    elif decisions and all(decision == "pass" for decision in decisions):
        suggested = "all-pass"
    else:
        suggested = "pending-human-listen"
    return {
        "schema": CONTROL_ROOM_SCHEMA,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "baselineId": baseline_id,
        "approvalStatusAtExport": "machine-candidate-needs-human-listen-proof",
        "branchInheritanceReadyAtExport": False,
        "reviewer": "Smoke Test",
        "suggestedOverallDecision": suggested,
        "notes": [
            {
                "id": f"control-room-{index}",
                "decision": decision,
                "notes": f"synthetic control-room {decision}",
            }
            for index, decision in enumerate(decisions, start=1)
        ],
    }


def run_planner(baseline_dir: Path, notes_paths: list[Path]) -> dict[str, Any]:
    args = [
        "python3",
        "apps/QuipslyStudio/script/audio_workbench_listen_notes_repair_planner.py",
        "--baseline-dir",
        str(baseline_dir),
        "--reviewer",
        "Smoke Test",
    ]
    for path in notes_paths:
        args.extend(["--notes-packet", str(path)])
    result = subprocess.run(args, cwd=repo_root(), text=True, capture_output=True)
    parsed: Any = None
    if result.stdout.strip():
        try:
            parsed = json.loads(result.stdout)
        except json.JSONDecodeError:
            parsed = None
    report = read_json(Path(parsed["json"])) if parsed and parsed.get("json") else None
    return {
        "returncode": result.returncode,
        "ok": result.returncode == 0,
        "stdout": result.stdout.strip(),
        "stderr": result.stderr.strip(),
        "parsedStdout": parsed,
        "report": report,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    real_baseline_dir = resolve_baseline_dir(args.baseline_dir)
    real_manifest_path = real_baseline_dir / "manifest.json"
    real_before = read_json(real_manifest_path)
    baseline_id = str(real_before.get("baselineId") or "unknown-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    scenarios: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="quipsly-listen-notes-repair-planner-smoke-") as temp_text:
        temp_root = Path(temp_text)
        cases = [
            ("no-notes", [], 0, 0, 0),
            ("listen-needs-repair", [listen_packet(baseline_id, ["pass", "needs-repair"])], 1, 1, 0),
            ("listen-needs-proof", [listen_packet(baseline_id, ["pass", "needs-proof"])], 1, 0, 1),
            ("marker-needs-repair", [marker_packet(baseline_id, ["needs-repair"])], 1, 1, 0),
            ("control-room-needs-repair", [control_room_packet(baseline_id, ["pass", "needs-repair"])], 1, 1, 0),
            ("control-room-needs-proof", [control_room_packet(baseline_id, ["pass", "needs-proof"])], 1, 0, 1),
            ("wrong-baseline", [listen_packet(baseline_id, ["needs-repair"], wrong_baseline=True)], 0, 0, 0),
        ]
        for name, packets, expected_valid, expected_repair, expected_proof in cases:
            baseline_dir = make_baseline(real_before, temp_root, name)
            notes_paths: list[Path] = []
            for index, packet in enumerate(packets, start=1):
                path = temp_root / name / f"notes-{index}.json"
                write_json(path, packet)
                notes_paths.append(path)
            result = run_planner(baseline_dir, notes_paths)
            report = result.get("report") or {}
            scenarios.append(
                {
                    "name": name,
                    "ok": bool(result["ok"])
                    and report.get("validNotesPacketCount") == expected_valid
                    and report.get("repairActionCount") == expected_repair
                    and report.get("focusedProofActionCount") == expected_proof
                    and report.get("approvalStateChanged") is False
                    and report.get("branchStateChanged") is False
                    and report.get("renderAttempted") is False
                    and report.get("originalMediaMutated") is False,
                    "returncode": result["returncode"],
                    "validNotesPacketCount": report.get("validNotesPacketCount"),
                    "repairActionCount": report.get("repairActionCount"),
                    "focusedProofActionCount": report.get("focusedProofActionCount"),
                    "stderr": result["stderr"],
                }
            )

    real_after = read_json(real_manifest_path)
    approval_preserved = real_before.get("approvalStatus") == real_after.get("approvalStatus")
    branch_preserved = real_before.get("branchInheritanceReady") == real_after.get("branchInheritanceReady") and real_before.get("branchRenderReady") == real_after.get("branchRenderReady")
    passed = all(scenario["ok"] for scenario in scenarios) and approval_preserved and branch_preserved

    output_json = real_baseline_dir / f"audio-listen-notes-repair-planner-smoke-{slug}-{generated_at}.json"
    output_md = real_baseline_dir / f"audio-listen-notes-repair-planner-smoke-{slug}-{generated_at}.md"
    payload = {
        "schema": "quipsly.audio-workbench.listen-notes-repair-planner-smoke.v1",
        "generatedAt": generated_at,
        "baselineDir": str(real_baseline_dir),
        "baselineId": baseline_id,
        "passed": passed,
        "scenarioCount": len(scenarios),
        "scenarios": scenarios,
        "realApprovalStatePreserved": approval_preserved,
        "realBranchStatePreserved": branch_preserved,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
        "markdown": str(output_md),
    }
    write_json(output_json, payload)

    lines = [
        "# Listen-notes repair planner smoke",
        "",
        f"Generated: `{generated_at}`",
        f"Baseline: `{baseline_id}`",
        f"Passed: `{str(passed).lower()}`",
        "",
        "| Scenario | OK | Valid packets | Repair | Proof |",
        "|---|---:|---:|---:|---:|",
    ]
    for scenario in scenarios:
        lines.append(
            f"| {scenario['name']} | {str(scenario['ok']).lower()} | "
            f"{scenario.get('validNotesPacketCount')} | {scenario.get('repairActionCount')} | {scenario.get('focusedProofActionCount')} |"
        )
    lines.extend(
        [
            "",
            "## Real manifest safety",
            "",
            f"- Approval state preserved: `{str(approval_preserved).lower()}`",
            f"- Branch state preserved: `{str(branch_preserved).lower()}`",
            "- Render attempted: `false`",
            "- Original media mutated: `false`",
            "",
        ]
    )
    output_md.write_text("\n".join(lines), encoding="utf-8")

    manifest = read_json(real_manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioListenNotesRepairPlannerSmoke"] = str(output_json)
    outputs["latestAudioListenNotesRepairPlannerSmokeMarkdown"] = str(output_md)
    history = outputs.setdefault("audioListenNotesRepairPlannerSmokes", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["audioListenNotesRepairPlannerSmokeCount"] = len(history)
    write_json(real_manifest_path, manifest)

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "passed": passed,
                "markdown": str(output_md),
                "json": str(output_json),
                "scenarioCount": len(scenarios),
                "realApprovalStatePreserved": approval_preserved,
                "realBranchStatePreserved": branch_preserved,
                "approvalStateChanged": False,
                "branchStateChanged": False,
                "renderAttempted": False,
                "originalMediaMutated": False,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
