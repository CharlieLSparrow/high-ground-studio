#!/usr/bin/env python3
"""Smoke-test the bleed repair executor gate without touching real media.

The smoke uses temporary baseline manifests that point at the real preflight
artifact, then confirms the executor routes pending, failed, and override states
correctly without rendering audio. It registers only the smoke report on the
real baseline manifest.
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


def load_json(path: Path) -> dict[str, Any]:
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


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def run_case(script: Path, source_manifest: dict[str, Any], label: str, edits: dict[str, Any], extra_args: list[str]) -> dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix=f"quipsly-bleed-executor-{label}-") as tmp:
        baseline_dir = Path(tmp)
        manifest = json.loads(json.dumps(source_manifest))
        manifest.update(edits)
        outputs = manifest.setdefault("outputs", {})
        outputs.pop("latestBleedRepairExecutor", None)
        outputs.pop("latestBleedRepairExecutorMarkdown", None)
        outputs.pop("bleedRepairExecutors", None)
        write_json(baseline_dir / "manifest.json", manifest)
        proc = subprocess.run(
            ["python3", str(script), "--baseline-dir", str(baseline_dir), *extra_args],
            text=True,
            capture_output=True,
            check=False,
        )
        result_manifest = load_json(baseline_dir / "manifest.json")
        return {
            "label": label,
            "returnCode": proc.returncode,
            "stdoutTail": proc.stdout[-2000:],
            "stderrTail": proc.stderr[-2000:],
            "executorStatus": result_manifest.get("bleedRepairExecutorStatus"),
            "renderAttempted": bool(result_manifest.get("bleedRepairExecutorRenderAttempted")),
            "renderSucceeded": bool(result_manifest.get("bleedRepairExecutorRenderSucceeded")),
            "realRepairAllowed": bool(result_manifest.get("bleedRepairExecutorRealRepairAllowed")),
            "originalMediaMutated": bool(result_manifest.get("bleedRepairExecutorOriginalMediaMutated")),
            "timelinePreserved": bool(result_manifest.get("bleedRepairExecutorTimelinePreserved")),
        }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Bleed Repair Executor Smoke: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This smoke uses temporary manifests and does not render media. It proves the executor gate routes states correctly.",
        "",
        f"- Passed: `{str(report['passed']).lower()}`",
        f"- Real manifest approval state preserved: `{str(report['realApprovalStatePreserved']).lower()}`",
        "",
        "## Cases",
        "",
        "| Case | Executor status | Allowed | Render attempted | Render succeeded | Original media mutated | Timeline preserved |",
        "|---|---|---:|---:|---:|---:|---:|",
    ]
    for case in report["cases"]:
        lines.append(
            "| "
            + " | ".join(
                [
                    str(case["label"]),
                    f"`{case['executorStatus']}`",
                    str(case["realRepairAllowed"]).lower(),
                    str(case["renderAttempted"]).lower(),
                    str(case["renderSucceeded"]).lower(),
                    str(case["originalMediaMutated"]).lower(),
                    str(case["timelinePreserved"]).lower(),
                ]
            )
            + " |"
        )
    if report["failures"]:
        lines.extend(["", "## Failures", ""])
        lines.extend(f"- {failure}" for failure in report["failures"])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = load_json(manifest_path)
    script = Path(__file__).with_name("audio_workbench_bleed_repair_executor.py")

    cases = [
        run_case(script, manifest_before, "pending-refuses-render-proof", {}, ["--render-proof"]),
        run_case(script, manifest_before, "failed-ready-no-render", {"approvalStatus": "failed-human-listen"}, []),
        run_case(script, manifest_before, "override-ready-no-render", {}, ["--allow-unapproved-proof-render"]),
    ]
    expected = {
        "pending-refuses-render-proof": {
            "executorStatus": "blocked-waiting-for-human-listen-failure",
            "realRepairAllowed": False,
            "renderAttempted": False,
            "renderSucceeded": False,
        },
        "failed-ready-no-render": {
            "executorStatus": "ready-after-human-failure",
            "realRepairAllowed": True,
            "renderAttempted": False,
            "renderSucceeded": False,
        },
        "override-ready-no-render": {
            "executorStatus": "ready-for-unapproved-proof-render",
            "realRepairAllowed": True,
            "renderAttempted": False,
            "renderSucceeded": False,
        },
    }
    failures: list[str] = []
    for case in cases:
        if case["returnCode"] != 0:
            failures.append(f"{case['label']} returned {case['returnCode']}: {case['stderrTail'] or case['stdoutTail']}")
        for key, expected_value in expected[case["label"]].items():
            if case.get(key) != expected_value:
                failures.append(f"{case['label']} expected {key}={expected_value!r}, got {case.get(key)!r}")
        if case["originalMediaMutated"]:
            failures.append(f"{case['label']} reported original media mutation")
        if not case["timelinePreserved"]:
            failures.append(f"{case['label']} did not preserve timeline")

    manifest_after = load_json(manifest_path)
    approval_preserved = (
        manifest_before.get("approvalStatus") == manifest_after.get("approvalStatus")
        and bool(manifest_before.get("branchInheritanceReady")) == bool(manifest_after.get("branchInheritanceReady"))
        and bool(manifest_before.get("branchRenderReady")) == bool(manifest_after.get("branchRenderReady"))
    )
    if not approval_preserved:
        failures.append("Real manifest approval/branch state changed during smoke")

    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    report = {
        "schema": "quipsly.audio-workbench.bleed-repair-executor-smoke.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "passed": not failures,
        "realApprovalStatePreserved": approval_preserved,
        "cases": cases,
        "failures": failures,
    }
    output_json = baseline_dir / f"audio-bleed-repair-executor-smoke-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"audio-bleed-repair-executor-smoke-{slug}-{generated_at}.md"
    write_json(output_json, report)
    output_md.write_text(render_markdown(report), encoding="utf-8")

    manifest = load_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestBleedRepairExecutorSmoke"] = str(output_json)
    outputs["latestBleedRepairExecutorSmokeMarkdown"] = str(output_md)
    history = outputs.setdefault("bleedRepairExecutorSmokes", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["bleedRepairExecutorSmokeCount"] = len(history)
    manifest["bleedRepairExecutorSmokePassed"] = not failures
    manifest["bleedRepairExecutorSmokeRealApprovalStatePreserved"] = approval_preserved
    write_json(manifest_path, manifest)

    print(f"Wrote {output_md}")
    print(f"Wrote {output_json}")
    print(f"Passed: {not failures}")
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
