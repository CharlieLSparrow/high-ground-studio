#!/usr/bin/env python3
"""Smoke-test the post-listen outcome router on isolated manifests.

The router decides which command family is safe after a human listen decision.
This smoke proves those routes without mutating the real baseline approval
state, rendering media, or exposing approved branch render commands while the
real candidate is still pending.
"""

from __future__ import annotations

import argparse
import json
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


def run_case(
    script: Path,
    source_manifest: dict[str, Any],
    label: str,
    edits: dict[str, Any],
) -> dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix=f"quipsly-post-listen-router-{label}-") as tmp:
        baseline_dir = Path(tmp)
        manifest = json.loads(json.dumps(source_manifest))
        manifest.update(edits)
        outputs = manifest.setdefault("outputs", {})
        outputs.pop("latestPostListenOutcomeRouter", None)
        outputs.pop("latestPostListenOutcomeRouterMarkdown", None)
        outputs.pop("latestPostListenOutcomeRouterHtml", None)
        outputs.pop("latestPostListenOutcomeRouterOpenCommand", None)
        outputs.pop("latestAudioPostListenOutcomeRouter", None)
        outputs.pop("latestAudioPostListenOutcomeRouterMarkdown", None)
        outputs.pop("latestAudioPostListenOutcomeRouterHtml", None)
        outputs.pop("latestAudioPostListenOutcomeRouterOpenCommand", None)
        outputs.pop("postListenOutcomeRouters", None)
        write_json(baseline_dir / "manifest.json", manifest)
        proc = subprocess.run(
            ["python3", str(script), "--baseline-dir", str(baseline_dir)],
            text=True,
            capture_output=True,
            check=False,
        )
        result_manifest = load_json(baseline_dir / "manifest.json")
        result_outputs = result_manifest.get("outputs", {})
        router_path = result_outputs.get("latestAudioPostListenOutcomeRouter") or result_outputs.get("latestPostListenOutcomeRouter")
        router_markdown_path = result_outputs.get("latestAudioPostListenOutcomeRouterMarkdown") or result_outputs.get("latestPostListenOutcomeRouterMarkdown")
        router_html_path = result_outputs.get("latestAudioPostListenOutcomeRouterHtml") or result_outputs.get("latestPostListenOutcomeRouterHtml")
        router_stable_html_path = result_outputs.get("latestAudioPostListenOutcomeRouterStableHtml") or result_outputs.get("latestPostListenOutcomeRouterStableHtml")
        router_open_command_path = result_outputs.get("latestAudioPostListenOutcomeRouterOpenCommand") or result_outputs.get("latestPostListenOutcomeRouterOpenCommand")
        router = load_json(Path(router_path)) if router_path and Path(router_path).exists() else {}
        commands = router.get("commands") or {}
        route = router.get("route") or {}
        return {
            "label": label,
            "returnCode": proc.returncode,
            "stdoutTail": proc.stdout[-2000:],
            "stderrTail": proc.stderr[-2000:],
            "routeStatus": route.get("routeStatus"),
            "sourceAwareBranchGateReady": bool(route.get("sourceAwareBranchGateReady")),
            "branchRenderAudioTruth": route.get("branchRenderAudioTruth"),
            "masteredSpineOnlyEditingAllowed": bool(route.get("masteredSpineOnlyEditingAllowed")),
            "realBranchRenderCommandsExposed": bool(router.get("realBranchRenderCommandsExposed")),
            "approvalStateChanged": bool(router.get("approvalStateChanged")),
            "renderAttempted": bool(router.get("renderAttempted")),
            "originalMediaMutated": bool(router.get("originalMediaMutated")),
            "markdownExists": bool(router_markdown_path and Path(router_markdown_path).exists()),
            "htmlExists": bool(router_html_path and Path(router_html_path).exists()),
            "stableHtmlExists": bool(router_stable_html_path and Path(router_stable_html_path).exists()),
            "openCommandExists": bool(router_open_command_path and Path(router_open_command_path).exists()),
            "commandCounts": {
                "openReview": len(commands.get("openReview") or []),
                "recordPassAfterHumanListen": len(commands.get("recordPassAfterHumanListen") or []),
                "recordFailAfterHumanListen": len(commands.get("recordFailAfterHumanListen") or []),
                "refreshBranchGate": len(commands.get("refreshBranchGate") or []),
                "refreshBranchPreflight": len(commands.get("refreshBranchPreflight") or []),
                "repairPreflight": len(commands.get("repairPreflight") or []),
                "approvedBranchRender": len(commands.get("approvedBranchRender") or []),
            },
        }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Post-Listen Outcome Router Smoke: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This smoke runs the router against temporary manifests only. It does not approve, render, publish, or mutate real media.",
        "",
        f"- Passed: `{str(report['passed']).lower()}`",
        f"- Real approval state preserved: `{str(report['realApprovalStatePreserved']).lower()}`",
        "",
        "## Cases",
        "",
        "| Case | Route | Branch commands exposed | Repair commands | Approval changed | Render attempted | Original media mutated |",
        "|---|---|---:|---:|---:|---:|---:|",
    ]
    for case in report["cases"]:
        counts = case["commandCounts"]
        lines.append(
            "| "
            + " | ".join(
                [
                    str(case["label"]),
                    f"`{case['routeStatus']}`",
                    str(counts["approvedBranchRender"]),
                    str(counts["repairPreflight"]),
                    str(case["approvalStateChanged"]).lower(),
                    str(case["renderAttempted"]).lower(),
                    str(case["originalMediaMutated"]).lower(),
                ]
            )
            + " |"
        )
    if report["failures"]:
        lines.extend(["", "## Failures", ""])
        lines.extend(f"- {failure}" for failure in report["failures"])
    return "\n".join(lines)


def assert_case(case: dict[str, Any], expected: dict[str, Any], failures: list[str]) -> None:
    label = case["label"]
    if case["returnCode"] != 0:
        failures.append(f"{label} returned {case['returnCode']}: {case['stderrTail'] or case['stdoutTail']}")
    for key, expected_value in expected.items():
        if key.startswith("commandCounts."):
            command_key = key.split(".", 1)[1]
            actual = case["commandCounts"].get(command_key)
        else:
            actual = case.get(key)
        if actual != expected_value:
            failures.append(f"{label} expected {key}={expected_value!r}, got {actual!r}")
    if case["approvalStateChanged"]:
        failures.append(f"{label} reported approval state changed")
    if case["renderAttempted"]:
        failures.append(f"{label} reported render attempted")
    if case["originalMediaMutated"]:
        failures.append(f"{label} reported original media mutation")
    if not case.get("markdownExists"):
        failures.append(f"{label} did not write a markdown router artifact")
    if not case.get("htmlExists"):
        failures.append(f"{label} did not write an HTML router artifact")
    if not case.get("stableHtmlExists"):
        failures.append(f"{label} did not write a stable HTML router artifact")
    if not case.get("openCommandExists"):
        failures.append(f"{label} did not write an open-command router artifact")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = load_json(manifest_path)
    script = Path(__file__).with_name("audio_workbench_post_listen_outcome_router.py")

    cases = [
        run_case(script, manifest_before, "pending-waits-for-human-listen", {}),
        run_case(script, manifest_before, "failed-routes-to-repair-executor", {"approvalStatus": "failed-human-listen"}),
        run_case(
            script,
            manifest_before,
            "approved-needs-branch-preflight-refresh",
            {"approvalStatus": "human-approved-for-branch-inheritance", "branchInheritanceReady": True, "branchRenderReady": False},
        ),
        run_case(
            script,
            manifest_before,
            "approved-ready-exposes-branch-render",
            {"approvalStatus": "human-approved-for-branch-inheritance", "branchInheritanceReady": True, "branchRenderReady": True},
        ),
        run_case(
            script,
            manifest_before,
            "approved-stale-flat-render-ready-blocked",
            {
                "approvalStatus": "human-approved-for-branch-inheritance",
                "branchInheritanceReady": True,
                "branchRenderReady": True,
                "branchRenderAudioTruth": "mastered-audio-spine",
                "masteredSpineOnlyEditingAllowed": True,
                "branchInheritanceGateSourceAwareBranchContractReady": False,
                "branchInheritanceGateSourceAwareBranchContractStatus": "missing-source-aware-contract",
                "branchInheritanceGatePostApprovalMasteredSpineOnlyEditingAllowed": True,
            },
        ),
    ]
    expectations = {
        "pending-waits-for-human-listen": {
            "routeStatus": "waiting-for-human-listen",
            "sourceAwareBranchGateReady": True,
            "branchRenderAudioTruth": "source-aware-refined-stems",
            "masteredSpineOnlyEditingAllowed": False,
            "realBranchRenderCommandsExposed": False,
            "commandCounts.recordPassAfterHumanListen": 8,
            "commandCounts.recordFailAfterHumanListen": 9,
            "commandCounts.repairPreflight": 0,
            "commandCounts.approvedBranchRender": 0,
        },
        "failed-routes-to-repair-executor": {
            "routeStatus": "repair-needed-after-human-listen",
            "sourceAwareBranchGateReady": True,
            "branchRenderAudioTruth": "source-aware-refined-stems",
            "masteredSpineOnlyEditingAllowed": False,
            "realBranchRenderCommandsExposed": False,
            "commandCounts.recordPassAfterHumanListen": 0,
            "commandCounts.recordFailAfterHumanListen": 0,
            "commandCounts.repairPreflight": 2,
            "commandCounts.approvedBranchRender": 0,
        },
        "approved-needs-branch-preflight-refresh": {
            "routeStatus": "approved-refresh-branch-preflight",
            "sourceAwareBranchGateReady": True,
            "branchRenderAudioTruth": "source-aware-refined-stems",
            "masteredSpineOnlyEditingAllowed": False,
            "realBranchRenderCommandsExposed": False,
            "commandCounts.refreshBranchPreflight": 2,
            "commandCounts.approvedBranchRender": 0,
        },
        "approved-ready-exposes-branch-render": {
            "routeStatus": "approved-ready-for-branch-render",
            "sourceAwareBranchGateReady": True,
            "branchRenderAudioTruth": "source-aware-refined-stems",
            "masteredSpineOnlyEditingAllowed": False,
            "realBranchRenderCommandsExposed": True,
            "commandCounts.approvedBranchRender": 1,
        },
        "approved-stale-flat-render-ready-blocked": {
            "routeStatus": "approved-source-aware-gate-blocked",
            "sourceAwareBranchGateReady": False,
            "branchRenderAudioTruth": "mastered-audio-spine",
            "masteredSpineOnlyEditingAllowed": True,
            "realBranchRenderCommandsExposed": False,
            "commandCounts.refreshBranchGate": 2,
            "commandCounts.approvedBranchRender": 0,
        },
    }
    failures: list[str] = []
    for case in cases:
        assert_case(case, expectations[case["label"]], failures)

    manifest_after = load_json(manifest_path)
    approval_preserved = (
        manifest_before.get("approvalStatus") == manifest_after.get("approvalStatus")
        and bool(manifest_before.get("branchInheritanceReady")) == bool(manifest_after.get("branchInheritanceReady"))
        and bool(manifest_before.get("branchRenderReady")) == bool(manifest_after.get("branchRenderReady"))
    )
    if not approval_preserved:
        failures.append("Real manifest approval/branch state changed during router smoke")

    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    report = {
        "schema": "quipsly.audio-workbench.post-listen-outcome-router-smoke.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "passed": not failures,
        "realApprovalStatePreserved": approval_preserved,
        "cases": cases,
        "failures": failures,
    }
    output_json = baseline_dir / f"audio-post-listen-outcome-router-smoke-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"audio-post-listen-outcome-router-smoke-{slug}-{generated_at}.md"
    write_json(output_json, report)
    output_md.write_text(render_markdown(report), encoding="utf-8")

    manifest = load_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestPostListenOutcomeRouterSmoke"] = str(output_json)
    outputs["latestPostListenOutcomeRouterSmokeMarkdown"] = str(output_md)
    outputs["latestAudioPostListenOutcomeRouterSmoke"] = str(output_json)
    outputs["latestAudioPostListenOutcomeRouterSmokeMarkdown"] = str(output_md)
    history = outputs.setdefault("postListenOutcomeRouterSmokes", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["postListenOutcomeRouterSmokeCount"] = len(history)
    manifest["postListenOutcomeRouterSmokePassed"] = not failures
    manifest["postListenOutcomeRouterSmokeRealApprovalStatePreserved"] = approval_preserved
    manifest["audioPostListenOutcomeRouterSmokeCount"] = len(history)
    manifest["audioPostListenOutcomeRouterSmokePassed"] = not failures
    manifest["audioPostListenOutcomeRouterSmokeRealApprovalStatePreserved"] = approval_preserved
    write_json(manifest_path, manifest)

    print(f"Wrote {output_md}")
    print(f"Wrote {output_json}")
    print(f"Passed: {not failures}")
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
