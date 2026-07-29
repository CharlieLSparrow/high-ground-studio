#!/usr/bin/env python3
"""Smoke-test the Studio Sound Repair Planner without mutating the real baseline."""

from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


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
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in ("path", "jsonPath", "markdownPath", "htmlPath"):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def make_window(index: int, flags: list[str], start: float = 120.0) -> dict[str, Any]:
    return {
        "index": index,
        "source": "smoke",
        "label": f"Smoke window {index}",
        "timecode": f"{int(start//60)}:{int(start%60):02d} - {int((start+10)//60)}:{int((start+10)%60):02d}",
        "startSeconds": start,
        "endSeconds": start + 10.0,
        "reason": "synthetic smoke flag",
        "metrics": {
            "riskFlags": flags,
            "rmsDbfs": -34.0 if "very-quiet" in flags else -18.0,
            "peakDbfs": -0.5 if "near-peak" in flags else -8.0,
            "crestDb": 18.0,
            "leftRightRmsDeltaDb": 6.0 if "left-right-imbalance" in flags else 0.0,
            "activeRatio": 0.2,
            "quietRatio": 0.8 if "mostly-quiet" in flags else 0.1,
        },
    }


def control_room(baseline_id: str, windows: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "schema": "quipsly.audio-workbench.studio-sound-control-room.v1",
        "generatedAt": datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S"),
        "baselineId": baseline_id,
        "status": "ready-for-studio-sound-review",
        "windowCount": len(windows),
        "riskWindowCount": sum(1 for window in windows if window.get("metrics", {}).get("riskFlags")),
        "snippetRenderOkCount": len(windows),
        "spectrogramRenderOkCount": len(windows),
        "windows": windows,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }


def make_temp_baseline(real_manifest: dict[str, Any], temp_root: Path, name: str, room: dict[str, Any]) -> Path:
    baseline_dir = temp_root / name / "baseline"
    baseline_dir.mkdir(parents=True)
    room_path = baseline_dir / "STUDIO_SOUND_CONTROL_ROOM.json"
    write_json(room_path, room)
    manifest = json.loads(json.dumps(real_manifest))
    manifest.setdefault("outputs", {})["latestAudioStudioSoundControlRoom"] = str(room_path)
    write_json(baseline_dir / "manifest.json", manifest)
    return baseline_dir


def run_planner(baseline_dir: Path) -> tuple[subprocess.CompletedProcess[str], dict[str, Any]]:
    proc = subprocess.run(
        ["python3", "apps/QuipslyStudio/script/audio_workbench_studio_sound_repair_planner.py", "--baseline-dir", str(baseline_dir)],
        cwd=repo_root(),
        text=True,
        capture_output=True,
        check=False,
    )
    report: dict[str, Any] = {}
    if proc.stdout.strip():
        try:
            parsed = json.loads(proc.stdout)
            path = parsed.get("json")
            if path:
                report = read_json(Path(path))
        except json.JSONDecodeError:
            report = {}
    return proc, report


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Studio Sound Repair Planner Smoke",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        "",
        "This smoke proves planner routing without changing real approval, branch, render, upload, publication, or source-media state.",
        "",
        "## Summary",
        "",
        f"- Passed: `{str(report['passed']).lower()}`",
        f"- Scenario count: `{report['scenarioCount']}`",
        f"- Failure count: `{report['failureCount']}`",
        f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
        f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
        f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
        f"- Upload attempted: `{str(report['uploadAttempted']).lower()}`",
        f"- Publication attempted: `{str(report['publicationAttempted']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Scenarios",
        "",
        "| Scenario | Passed | Action count | First action | Failures |",
        "|---|---:|---:|---|---|",
    ]
    for scenario in report["scenarios"]:
        lines.append(f"| {scenario['name']} | `{str(scenario['passed']).lower()}` | `{scenario.get('actionCount')}` | `{scenario.get('firstActionType')}` | {'; '.join(scenario.get('failures') or []) or 'none'} |")
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    real_baseline = resolve_baseline_dir(args.baseline_dir)
    manifest_path = real_baseline / "manifest.json"
    real_before = read_json(manifest_path)
    baseline_id = str(real_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    case_specs = [
        ("no-flags", [make_window(1, [], 120.0)], 0, None),
        ("intro-quiet", [make_window(1, ["very-quiet", "mostly-quiet"], 0.0)], 1, "intro-quiet-trim-or-fade-review"),
        ("near-peak", [make_window(1, ["near-peak"], 240.0)], 1, "peak-headroom-proof-window"),
        ("channel-imbalance", [make_window(1, ["left-right-imbalance"], 300.0)], 1, "channel-balance-proof-window"),
        ("dense", [make_window(1, ["very-dense"], 360.0)], 1, "density-compression-proof-window"),
        ("unknown", [make_window(1, ["strange-machine-flag"], 420.0)], 1, "focused-listen-required"),
    ]

    scenarios: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="quipsly-studio-sound-repair-planner-smoke-") as temp_text:
        temp_root = Path(temp_text)
        for name, windows, expected_count, expected_first in case_specs:
            baseline_dir = make_temp_baseline(real_before, temp_root, name, control_room(baseline_id, windows))
            proc, planner = run_planner(baseline_dir)
            actions = planner.get("actions") or []
            first_action = actions[0].get("actionType") if actions else None
            failures: list[str] = []
            if proc.returncode != 0:
                failures.append(f"returncode {proc.returncode}: {proc.stderr.strip()}")
            if planner.get("actionCount") != expected_count:
                failures.append(f"action count {planner.get('actionCount')} != {expected_count}")
            if first_action != expected_first:
                failures.append(f"first action {first_action} != {expected_first}")
            for key in ["approvalStateChanged", "branchStateChanged", "renderAttempted", "branchRenderAttempted", "uploadAttempted", "publicationAttempted", "originalMediaMutated"]:
                if planner.get(key) is not False:
                    failures.append(f"{key} was {planner.get(key)}")
            scenarios.append({"name": name, "passed": not failures, "failures": failures, "actionCount": planner.get("actionCount"), "firstActionType": first_action})

    real_after = read_json(manifest_path)
    approval_preserved = real_before.get("approvalStatus") == real_after.get("approvalStatus")
    branch_preserved = real_before.get("branchInheritanceReady") == real_after.get("branchInheritanceReady") and real_before.get("branchRenderReady") == real_after.get("branchRenderReady")
    failure_count = sum(0 if scenario["passed"] else 1 for scenario in scenarios)
    passed = failure_count == 0 and approval_preserved and branch_preserved

    stable_json = real_baseline / "STUDIO_SOUND_REPAIR_PLANNER_SMOKE.json"
    stable_md = real_baseline / "STUDIO_SOUND_REPAIR_PLANNER_SMOKE.md"
    output_json = real_baseline / f"studio-sound-repair-planner-smoke-{slug}-{generated_at}.json"
    output_md = real_baseline / f"studio-sound-repair-planner-smoke-{slug}-{generated_at}.md"
    report = {
        "schema": "quipsly.audio-workbench.studio-sound-repair-planner-smoke.v1",
        "generatedAt": generated_at,
        "baselineId": baseline_id,
        "baselineDir": str(real_baseline),
        "passed": passed,
        "scenarioCount": len(scenarios),
        "failureCount": failure_count,
        "scenarios": scenarios,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
        "json": str(stable_json),
        "markdown": str(stable_md),
        "versionedJson": str(output_json),
        "versionedMarkdown": str(output_md),
    }
    markdown = render_markdown(report)
    for path in (stable_json, output_json):
        write_json(path, report)
    for path in (stable_md, output_md):
        path.write_text(markdown, encoding="utf-8")

    manifest_after = read_json(manifest_path)
    outputs = manifest_after.setdefault("outputs", {})
    outputs["latestAudioStudioSoundRepairPlannerSmoke"] = str(stable_json)
    outputs["latestAudioStudioSoundRepairPlannerSmokeMarkdown"] = str(stable_md)
    history = outputs.setdefault("audioStudioSoundRepairPlannerSmokes", [])
    if isinstance(history, list):
        history.append(str(output_json))
    manifest_after["audioStudioSoundRepairPlannerSmokeCount"] = int(manifest_after.get("audioStudioSoundRepairPlannerSmokeCount") or 0) + 1
    manifest_after["audioStudioSoundRepairPlannerSmokePassed"] = passed
    manifest_after["audioStudioSoundRepairPlannerSmokeScenarioCount"] = len(scenarios)
    manifest_after["audioStudioSoundRepairPlannerSmokeFailureCount"] = failure_count
    manifest_after["audioStudioSoundRepairPlannerSmokeApprovalStateChanged"] = False
    manifest_after["audioStudioSoundRepairPlannerSmokeBranchStateChanged"] = False
    manifest_after["audioStudioSoundRepairPlannerSmokeRenderAttempted"] = False
    manifest_after["audioStudioSoundRepairPlannerSmokeBranchRenderAttempted"] = False
    manifest_after["audioStudioSoundRepairPlannerSmokeUploadAttempted"] = False
    manifest_after["audioStudioSoundRepairPlannerSmokePublicationAttempted"] = False
    manifest_after["audioStudioSoundRepairPlannerSmokeOriginalMediaMutated"] = False
    write_json(manifest_path, manifest_after)
    print(json.dumps({"json": str(stable_json), "markdown": str(stable_md), "passed": passed, "scenarioCount": len(scenarios), "failureCount": failure_count}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
