#!/usr/bin/env python3
"""Smoke-test the audio review status board without mutating approval truth.

The smoke copies only manifest.json to a temporary baseline folder, creates
synthetic marker-review notes packets, runs the real status-board script, and
verifies the expected review states. It then registers the smoke report on the
real manifest without approving audio, failing audio, rendering branches,
uploading files, or mutating original media.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


MARKER_REVIEW_SCHEMA = "quipsly.audio-workbench.marker-review-notes.v1"


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
    raise FileNotFoundError(
        "Could not find manifest.json at "
        f"{input_path}/manifest.json or {nested}/manifest.json"
    )


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def marker_packet(
    *,
    baseline_id: str,
    path: Path,
    decisions: list[str],
    exported: bool = True,
) -> Path:
    packet = {
        "schema": MARKER_REVIEW_SCHEMA,
        "baselineId": baseline_id,
        "exportedAt": datetime.now(timezone.utc).isoformat() if exported else None,
        "markers": [
            {
                "id": f"marker-{index + 1}",
                "label": f"Synthetic marker {index + 1}",
                "timeSec": float(index * 10),
                "decision": decision,
                "notes": f"synthetic {decision}",
            }
            for index, decision in enumerate(decisions)
        ],
    }
    write_json(path, packet)
    return path


def run_status_board(temp_baseline: Path, search_dir: Path) -> tuple[dict[str, Any], subprocess.CompletedProcess[str]]:
    result = subprocess.run(
        [
            "python3",
            "apps/QuipslyStudio/script/audio_workbench_review_status_board.py",
            "--baseline-dir",
            str(temp_baseline),
            "--search-dir",
            str(search_dir),
        ],
        cwd=repo_root(),
        text=True,
        capture_output=True,
    )
    status = read_json(temp_baseline / "EPISODE_4_AUDIO_REVIEW_STATUS.json")
    return status, result


def scenario_result(
    *,
    name: str,
    expected_state: str,
    status: dict[str, Any],
    result: subprocess.CompletedProcess[str],
    expected_matches: int | None = None,
    expect_ignored: bool | None = None,
) -> dict[str, Any]:
    matching_count = len(status.get("matchingCandidates") or [])
    ignored_count = len(status.get("ignoredFiles") or [])
    checks = {
        "processOk": result.returncode == 0,
        "reviewStateOk": status.get("reviewState") == expected_state,
        "approvalUnchangedByStatusBoard": status.get("approvalStateChanged") is False,
        "branchUnchangedByStatusBoard": status.get("branchStateChanged") is False,
        "renderNotAttempted": status.get("renderAttempted") is False,
        "originalMediaNotMutated": status.get("originalMediaMutated") is False,
    }
    if expected_matches is not None:
        checks["matchingCountOk"] = matching_count == expected_matches
    if expect_ignored is not None:
        checks["ignoredFilesOk"] = bool(ignored_count) == expect_ignored
    return {
        "name": name,
        "expectedState": expected_state,
        "actualState": status.get("reviewState"),
        "matchingCandidates": matching_count,
        "ignoredFiles": ignored_count,
        "returncode": result.returncode,
        "stdout": result.stdout.strip(),
        "stderr": result.stderr.strip(),
        "checks": checks,
        "passed": all(checks.values()),
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Audio Review Status Board Smoke: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This smoke tested the status board in temporary baseline folders. It did not approve audio, fail audio, render branches, upload files, or mutate original media.",
        "",
        f"- Passed: `{str(report['passed']).lower()}`",
        f"- Real approval state preserved: `{str(report['realApprovalStatePreserved']).lower()}`",
        f"- Real branch state preserved: `{str(report['realBranchStatePreserved']).lower()}`",
        f"- Real render state preserved: `{str(report['realRenderStatePreserved']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Scenarios",
        "",
        "| Scenario | Expected | Actual | Matching | Ignored | Passed |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for scenario in report["scenarios"]:
        lines.append(
            f"| {scenario['name']} | `{scenario['expectedState']}` | `{scenario['actualState']}` | "
            f"`{scenario['matchingCandidates']}` | `{scenario['ignoredFiles']}` | `{str(scenario['passed']).lower()}` |"
        )
    lines.extend(
        [
            "",
            "## Guardrail",
            "",
            "A passing smoke means the status board can classify exported notes safely. It is not human approval. Branch rendering remains locked until a real human listen decision is recorded through the guarded command path.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    generated_iso = datetime.now(timezone.utc).isoformat()

    scenarios: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="quipsly-status-board-smoke-") as tmp:
        tmp_root = Path(tmp)

        def make_temp_baseline(name: str) -> tuple[Path, Path]:
            temp_baseline = tmp_root / f"{name}-baseline"
            search_dir = tmp_root / f"{name}-notes"
            temp_baseline.mkdir()
            search_dir.mkdir()
            shutil.copy2(manifest_path, temp_baseline / "manifest.json")
            return temp_baseline, search_dir

        temp_baseline, search_dir = make_temp_baseline("no-notes")
        status, result = run_status_board(temp_baseline, search_dir)
        scenarios.append(
            scenario_result(
                name="no-notes",
                expected_state="waiting-for-human-notes",
                status=status,
                result=result,
                expected_matches=0,
                expect_ignored=False,
            )
        )

        temp_baseline, search_dir = make_temp_baseline("all-pass")
        marker_packet(baseline_id=baseline_id, path=search_dir / "marker-review-notes-all-pass.json", decisions=["pass", "pass"])
        status, result = run_status_board(temp_baseline, search_dir)
        scenarios.append(
            scenario_result(
                name="all-pass-notes",
                expected_state="exported-notes-ready-for-guarded-approval",
                status=status,
                result=result,
                expected_matches=1,
                expect_ignored=False,
            )
        )

        temp_baseline, search_dir = make_temp_baseline("needs-repair")
        marker_packet(
            baseline_id=baseline_id,
            path=search_dir / "marker-review-notes-needs-repair.json",
            decisions=["pass", "needs-repair"],
        )
        status, result = run_status_board(temp_baseline, search_dir)
        scenarios.append(
            scenario_result(
                name="needs-repair-notes",
                expected_state="exported-notes-say-repair-needed",
                status=status,
                result=result,
                expected_matches=1,
                expect_ignored=False,
            )
        )

        temp_baseline, search_dir = make_temp_baseline("needs-proof")
        marker_packet(
            baseline_id=baseline_id,
            path=search_dir / "marker-review-notes-needs-proof.json",
            decisions=["pass", "needs-proof"],
        )
        status, result = run_status_board(temp_baseline, search_dir)
        scenarios.append(
            scenario_result(
                name="needs-proof-notes",
                expected_state="exported-notes-say-more-proof-needed",
                status=status,
                result=result,
                expected_matches=1,
                expect_ignored=False,
            )
        )

        temp_baseline, search_dir = make_temp_baseline("wrong-baseline")
        marker_packet(
            baseline_id="wrong-baseline-id",
            path=search_dir / "marker-review-notes-wrong-baseline.json",
            decisions=["pass", "pass"],
        )
        status, result = run_status_board(temp_baseline, search_dir)
        scenarios.append(
            scenario_result(
                name="wrong-baseline-notes",
                expected_state="waiting-for-human-notes",
                status=status,
                result=result,
                expected_matches=0,
                expect_ignored=True,
            )
        )

    manifest_after = read_json(manifest_path)
    real_approval_state_preserved = (
        manifest_before.get("approvalStatus"),
        manifest_before.get("branchInheritanceReady"),
        manifest_before.get("branchRenderReady"),
        manifest_before.get("packageReadyForHumanListen"),
    ) == (
        manifest_after.get("approvalStatus"),
        manifest_after.get("branchInheritanceReady"),
        manifest_after.get("branchRenderReady"),
        manifest_after.get("packageReadyForHumanListen"),
    )
    report = {
        "schema": "quipsly.audio-workbench.review-status-board-smoke.v1",
        "generatedAt": generated_iso,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "scenarios": scenarios,
        "passed": all(scenario["passed"] for scenario in scenarios) and real_approval_state_preserved,
        "realApprovalStatePreserved": real_approval_state_preserved,
        "realBranchStatePreserved": real_approval_state_preserved,
        "realRenderStatePreserved": real_approval_state_preserved,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }

    output_json = baseline_dir / f"audio-review-status-board-smoke-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"audio-review-status-board-smoke-{slug}-{generated_at}.md"
    report["json"] = str(output_json)
    report["markdown"] = str(output_md)
    write_json(output_json, report)
    output_md.write_text(render_markdown(report), encoding="utf-8")

    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioReviewStatusBoardSmoke"] = str(output_json)
    outputs["latestAudioReviewStatusBoardSmokeMarkdown"] = str(output_md)
    history = outputs.setdefault("audioReviewStatusBoardSmokes", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["audioReviewStatusBoardSmokeCount"] = len(history)
    write_json(manifest_path, manifest)

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "passed": report["passed"],
                "scenarioCount": len(scenarios),
                "realApprovalStatePreserved": real_approval_state_preserved,
                "markdown": str(output_md),
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
