#!/usr/bin/env python3
"""Smoke-test the listen-priority notes inbox without mutating the real baseline."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


LISTEN_PRIORITY_SCHEMA = "quipsly.audio-workbench.listen-priority-notes.v1"
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


def scenario_packet(baseline_id: str, decisions: list[str], *, wrong_baseline: bool = False) -> dict[str, Any]:
    return {
        "schema": LISTEN_PRIORITY_SCHEMA,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "baselineId": baseline_id + "-wrong" if wrong_baseline else baseline_id,
        "approvalStatusAtExport": "machine-candidate-needs-human-listen-proof",
        "humanListenStillRequiredAtExport": True,
        "overallNotes": "synthetic smoke packet",
        "items": [
            {
                "id": f"smoke-{index}",
                "label": f"Smoke listen item {index}",
                "timecode": f"00:00:{index:02d}.000",
                "decision": decision,
                "notes": f"synthetic {decision} note",
            }
            for index, decision in enumerate(decisions, start=1)
        ],
        "suggestedDecision": "pending-human-listen",
    }


def control_room_packet(baseline_id: str, decisions: list[str], *, wrong_baseline: bool = False) -> dict[str, Any]:
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
        "baselineId": baseline_id + "-wrong" if wrong_baseline else baseline_id,
        "approvalStatusAtExport": "machine-candidate-needs-human-listen-proof",
        "branchInheritanceReadyAtExport": False,
        "reviewer": "Smoke Test",
        "suggestedOverallDecision": suggested,
        "notes": [
            {
                "id": f"control-room-smoke-{index}",
                "decision": decision,
                "notes": f"synthetic control room {decision} note",
            }
            for index, decision in enumerate(decisions, start=1)
        ],
    }


def make_temp_baseline(real_manifest: dict[str, Any], temp_root: Path, scenario_name: str) -> tuple[Path, Path]:
    baseline_dir = temp_root / scenario_name / "baseline"
    search_dir = temp_root / scenario_name / "search"
    baseline_dir.mkdir(parents=True)
    search_dir.mkdir(parents=True)
    manifest = json.loads(json.dumps(real_manifest))
    manifest["outputs"] = {
        "latestAudioListenPriorityConsoleHtml": str(search_dir / "fake-listen-priority-console.html")
    }
    write_json(search_dir / "fake-listen-priority-console.html.json", {"note": "not a notes packet"})
    write_json(baseline_dir / "manifest.json", manifest)
    return baseline_dir, search_dir


def run_inbox(baseline_dir: Path, search_dir: Path) -> dict[str, Any]:
    result = subprocess.run(
        [
            "python3",
            "apps/QuipslyStudio/script/audio_workbench_listen_priority_notes_inbox.py",
            "--baseline-dir",
            str(baseline_dir),
            "--no-default-search",
            "--search-dir",
            str(search_dir),
            "--reviewer",
            "Smoke Test",
        ],
        cwd=repo_root(),
        text=True,
        capture_output=True,
    )
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
    with tempfile.TemporaryDirectory(prefix="quipsly-listen-priority-inbox-smoke-") as temp_text:
        temp_root = Path(temp_text)
        cases = [
            ("no-notes", None, 0, None),
            ("all-pass", scenario_packet(baseline_id, ["pass", "pass", "pass"]), 1, "human-approved-for-branch-inheritance"),
            ("needs-repair", scenario_packet(baseline_id, ["pass", "needs-repair", "pass"]), 1, "failed-human-listen"),
            ("needs-proof", scenario_packet(baseline_id, ["pass", "needs-proof", "pass"]), 1, "needs-focused-proof"),
            ("control-room-all-pass", control_room_packet(baseline_id, ["pass", "pass", "pass"]), 1, "human-approved-for-branch-inheritance"),
            ("control-room-needs-repair", control_room_packet(baseline_id, ["pass", "needs-repair", "pass"]), 1, "failed-human-listen"),
            ("control-room-needs-proof", control_room_packet(baseline_id, ["pass", "needs-proof", "pass"]), 1, "needs-focused-proof"),
            ("wrong-baseline", scenario_packet(baseline_id, ["pass"], wrong_baseline=True), 0, None),
        ]
        for name, packet, expected_count, expected_status in cases:
            baseline_dir, search_dir = make_temp_baseline(real_before, temp_root, name)
            if packet:
                filename = (
                    f"{name}-human-listen-control-room-notes.json"
                    if packet.get("schema") == CONTROL_ROOM_SCHEMA
                    else f"{name}-listen-priority-notes.json"
                )
                write_json(search_dir / filename, packet)
            result = run_inbox(baseline_dir, search_dir)
            report = result.get("report") or {}
            selected = report.get("selectedCandidate") or {}
            scenarios.append(
                {
                    "name": name,
                    "ok": bool(result["ok"])
                    and report.get("matchingCandidateCount") == expected_count
                    and (expected_status is None or selected.get("suggestedDecisionStatus") == expected_status)
                    and report.get("approvalStateChanged") is False
                    and report.get("branchStateChanged") is False
                    and report.get("renderAttempted") is False
                    and report.get("originalMediaMutated") is False,
                    "returncode": result["returncode"],
                    "expectedMatchingCandidateCount": expected_count,
                    "matchingCandidateCount": report.get("matchingCandidateCount"),
                    "expectedSuggestedStatus": expected_status,
                    "selectedSuggestedStatus": selected.get("suggestedDecisionStatus"),
                    "decisionDryRunOk": (report.get("decisionDryRun") or {}).get("ok"),
                    "stderr": result["stderr"],
                }
            )

    real_after = read_json(real_manifest_path)
    approval_preserved = real_before.get("approvalStatus") == real_after.get("approvalStatus")
    branch_preserved = real_before.get("branchInheritanceReady") == real_after.get("branchInheritanceReady") and real_before.get("branchRenderReady") == real_after.get("branchRenderReady")
    passed = all(scenario["ok"] for scenario in scenarios) and approval_preserved and branch_preserved

    output_json = real_baseline_dir / f"audio-listen-priority-notes-inbox-smoke-{slug}-{generated_at}.json"
    output_md = real_baseline_dir / f"audio-listen-priority-notes-inbox-smoke-{slug}-{generated_at}.md"
    payload = {
        "schema": "quipsly.audio-workbench.listen-priority-notes-inbox-smoke.v1",
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

    md_lines = [
        "# Listen-priority notes inbox smoke",
        "",
        f"Generated: `{generated_at}`",
        f"Baseline: `{baseline_id}`",
        f"Passed: `{str(passed).lower()}`",
        "",
        "| Scenario | OK | Matching | Status | Dry-run OK |",
        "|---|---:|---:|---|---:|",
    ]
    for scenario in scenarios:
        md_lines.append(
            f"| {scenario['name']} | {str(scenario['ok']).lower()} | "
            f"{scenario.get('matchingCandidateCount')} | {scenario.get('selectedSuggestedStatus') or ''} | "
            f"{str(scenario.get('decisionDryRunOk')).lower()} |"
        )
    md_lines.extend(
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
    output_md.write_text("\n".join(md_lines), encoding="utf-8")

    latest_manifest = read_json(real_manifest_path)
    outputs = latest_manifest.setdefault("outputs", {})
    outputs["latestAudioListenPriorityNotesInboxSmoke"] = str(output_json)
    outputs["latestAudioListenPriorityNotesInboxSmokeMarkdown"] = str(output_md)
    history = outputs.setdefault("audioListenPriorityNotesInboxSmokes", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    latest_manifest["audioListenPriorityNotesInboxSmokeCount"] = len(history)
    write_json(real_manifest_path, latest_manifest)

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
