#!/usr/bin/env python3
"""Smoke-test the post-human-listen notes roundtrip control plane.

This guards the reviewer handoff seam after someone exports listen notes. It
runs the real roundtrip against a temporary baseline copy and verifies that the
roundtrip:

- completes every control-plane step,
- registers every important artifact with an existing path,
- preserves approval and branch truth,
- does not render branch media or mutate original media.

The smoke registers only its own report on the real baseline manifest.
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
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def parse_stdout(stdout: str) -> dict[str, Any] | None:
    text = stdout.strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def run_roundtrip(temp_baseline: Path) -> dict[str, Any]:
    result = subprocess.run(
        [
            "python3",
            "apps/QuipslyStudio/script/audio_workbench_post_human_listen_notes_roundtrip.py",
            "--baseline-dir",
            str(temp_baseline),
        ],
        cwd=repo_root(),
        text=True,
        capture_output=True,
    )
    parsed = parse_stdout(result.stdout)
    report = read_json(Path(parsed["json"])) if parsed and parsed.get("json") else None
    decision_rehearsal_report = None
    if report:
        decision_rehearsal = next(
            (item for item in report.get("artifacts", []) if item.get("label") == "Human-listen decision rehearsal"),
            None,
        )
        if decision_rehearsal and decision_rehearsal.get("path") and Path(decision_rehearsal["path"]).exists():
            decision_rehearsal_report = read_json(Path(decision_rehearsal["path"]))
    return {
        "returncode": result.returncode,
        "ok": result.returncode == 0,
        "stdout": result.stdout.strip(),
        "stderr": result.stderr.strip(),
        "parsedStdout": parsed,
        "report": report,
        "decisionRehearsalReport": decision_rehearsal_report,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Post-human-listen notes roundtrip smoke",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        "",
        "This smoke ran the real post-human-listen notes roundtrip against a temporary baseline copy. It did not approve audio, fail audio, render branches, upload files, or mutate original media.",
        "",
        f"- Passed: `{str(report['passed']).lower()}`",
        f"- Process OK: `{str(report['processOk']).lower()}`",
        f"- Roundtrip all steps OK: `{str(report['roundtripAllStepsOk']).lower()}`",
        f"- Artifact table complete: `{str(report['artifactTableComplete']).lower()}`",
        f"- Post-listen router registered: `{str(report['postListenRouterRegistered']).lower()}`",
        f"- Human-listen decision rehearsal registered: `{str(report['humanListenDecisionRehearsalRegistered']).lower()}`",
        f"- Human-listen decision rehearsal step OK: `{str(report['humanListenDecisionRehearsalStepOk']).lower()}`",
        f"- Human-listen decision rehearsal passed: `{str(report['humanListenDecisionRehearsalPassed']).lower()}`",
        f"- Human-listen rehearsal manifest unchanged: `{str(report['humanListenDecisionRehearsalManifestUnchanged']).lower()}`",
        f"- Real approval state preserved: `{str(report['realApprovalStatePreserved']).lower()}`",
        f"- Real branch state preserved: `{str(report['realBranchStatePreserved']).lower()}`",
        f"- Real render state preserved: `{str(report['realRenderStatePreserved']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Missing artifacts",
        "",
    ]
    missing = report.get("missingArtifacts") or []
    if not missing:
        lines.append("None.")
    else:
        for item in missing:
            lines.append(f"- `{item.get('label')}` via `{item.get('key')}` -> `{item.get('path')}`")
    lines.extend([
        "",
        "## Guardrail",
        "",
        "A passing smoke only proves the roundtrip can refresh the review control plane honestly. Human listen proof is still required before branch inheritance or full renders are unlocked.",
        "",
    ])
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

    with tempfile.TemporaryDirectory(prefix="quipsly-post-listen-roundtrip-smoke-") as tmp:
        temp_baseline = Path(tmp) / "baseline"
        temp_baseline.mkdir(parents=True)
        shutil.copy2(manifest_path, temp_baseline / "manifest.json")
        result = run_roundtrip(temp_baseline)

    roundtrip = result.get("report") or {}
    artifacts = roundtrip.get("artifacts") or []
    missing_artifacts = [item for item in artifacts if not item.get("exists")]
    post_router = next((item for item in artifacts if item.get("label") == "Post-listen outcome router"), None)
    decision_rehearsal = next((item for item in artifacts if item.get("label") == "Human-listen decision rehearsal"), None)
    rehearsal_step = next((step for step in roundtrip.get("steps", []) if step.get("label") == "human-listen decision rehearsal"), None)
    rehearsal_report = result.get("decisionRehearsalReport")
    rehearsal_registered = bool(decision_rehearsal and decision_rehearsal.get("exists") and decision_rehearsal.get("path"))
    rehearsal_step_ok = bool(rehearsal_step and rehearsal_step.get("ok"))
    rehearsal_passed = bool(rehearsal_report and rehearsal_report.get("passed") is True)
    rehearsal_manifest_unchanged = bool(rehearsal_report and rehearsal_report.get("dryRunManifestUnchanged") is True)
    temp_truth_preserved = (
        roundtrip.get("approvalStateChanged") is False
        and roundtrip.get("branchStateChanged") is False
        and roundtrip.get("renderAttempted") is False
        and roundtrip.get("originalMediaMutated") is False
    )

    manifest_after = read_json(manifest_path)
    approval_preserved = manifest_before.get("approvalStatus") == manifest_after.get("approvalStatus")
    branch_preserved = (
        manifest_before.get("branchInheritanceReady") == manifest_after.get("branchInheritanceReady")
        and manifest_before.get("branchRenderReady") == manifest_after.get("branchRenderReady")
    )
    render_preserved = manifest_before.get("branchRenderReady") == manifest_after.get("branchRenderReady")

    passed = (
        result["ok"]
        and roundtrip.get("allStepsOk") is True
        and bool(artifacts)
        and not missing_artifacts
        and bool(post_router and post_router.get("exists") and post_router.get("path"))
        and rehearsal_registered
        and rehearsal_step_ok
        and rehearsal_passed
        and rehearsal_manifest_unchanged
        and temp_truth_preserved
        and approval_preserved
        and branch_preserved
        and render_preserved
    )

    output_json = baseline_dir / f"audio-post-human-listen-notes-roundtrip-smoke-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"audio-post-human-listen-notes-roundtrip-smoke-{slug}-{generated_at}.md"
    payload = {
        "schema": "quipsly.audio-workbench.post-human-listen-notes-roundtrip-smoke.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "passed": passed,
        "processOk": result["ok"],
        "returncode": result["returncode"],
        "roundtripAllStepsOk": roundtrip.get("allStepsOk") is True,
        "artifactTableComplete": bool(artifacts) and not missing_artifacts,
        "artifactCount": len(artifacts),
        "missingArtifacts": missing_artifacts,
        "postListenRouterRegistered": bool(post_router and post_router.get("exists") and post_router.get("path")),
        "humanListenDecisionRehearsalRegistered": rehearsal_registered,
        "humanListenDecisionRehearsalStepOk": rehearsal_step_ok,
        "humanListenDecisionRehearsalPassed": rehearsal_passed,
        "humanListenDecisionRehearsalManifestUnchanged": rehearsal_manifest_unchanged,
        "roundtripApprovalStateChanged": roundtrip.get("approvalStateChanged"),
        "roundtripBranchStateChanged": roundtrip.get("branchStateChanged"),
        "roundtripRenderAttempted": roundtrip.get("renderAttempted"),
        "roundtripOriginalMediaMutated": roundtrip.get("originalMediaMutated"),
        "realApprovalStatePreserved": approval_preserved,
        "realBranchStatePreserved": branch_preserved,
        "realRenderStatePreserved": render_preserved,
        "originalMediaMutated": False,
        "stderr": result["stderr"],
        "stdout": result["stdout"],
        "markdown": str(output_md),
    }
    write_json(output_json, payload)
    output_md.write_text(render_markdown(payload), encoding="utf-8")

    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioPostHumanListenNotesRoundtripSmoke"] = str(output_json)
    outputs["latestAudioPostHumanListenNotesRoundtripSmokeMarkdown"] = str(output_md)
    history = outputs.setdefault("audioPostHumanListenNotesRoundtripSmokes", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["audioPostHumanListenNotesRoundtripSmokeCount"] = len(history)
    manifest["audioPostHumanListenNotesRoundtripSmokePassed"] = passed
    manifest["audioPostHumanListenNotesRoundtripSmokeArtifactTableComplete"] = payload["artifactTableComplete"]
    manifest["audioPostHumanListenNotesRoundtripSmokePostListenRouterRegistered"] = payload["postListenRouterRegistered"]
    manifest["audioPostHumanListenNotesRoundtripSmokeHumanListenDecisionRehearsalRegistered"] = payload["humanListenDecisionRehearsalRegistered"]
    manifest["audioPostHumanListenNotesRoundtripSmokeHumanListenDecisionRehearsalStepOk"] = payload["humanListenDecisionRehearsalStepOk"]
    manifest["audioPostHumanListenNotesRoundtripSmokeHumanListenDecisionRehearsalPassed"] = payload["humanListenDecisionRehearsalPassed"]
    manifest["audioPostHumanListenNotesRoundtripSmokeHumanListenDecisionRehearsalManifestUnchanged"] = payload["humanListenDecisionRehearsalManifestUnchanged"]
    manifest["audioPostHumanListenNotesRoundtripSmokeApprovalStatePreserved"] = approval_preserved
    manifest["audioPostHumanListenNotesRoundtripSmokeBranchStatePreserved"] = branch_preserved
    manifest["audioPostHumanListenNotesRoundtripSmokeRenderAttempted"] = False
    manifest["audioPostHumanListenNotesRoundtripSmokeOriginalMediaMutated"] = False
    write_json(manifest_path, manifest)

    print(json.dumps({
        "passed": passed,
        "json": str(output_json),
        "markdown": str(output_md),
        "artifactTableComplete": payload["artifactTableComplete"],
        "postListenRouterRegistered": payload["postListenRouterRegistered"],
        "humanListenDecisionRehearsalRegistered": payload["humanListenDecisionRehearsalRegistered"],
        "humanListenDecisionRehearsalStepOk": payload["humanListenDecisionRehearsalStepOk"],
        "humanListenDecisionRehearsalPassed": payload["humanListenDecisionRehearsalPassed"],
        "humanListenDecisionRehearsalManifestUnchanged": payload["humanListenDecisionRehearsalManifestUnchanged"],
        "approvalStatePreserved": approval_preserved,
        "branchStatePreserved": branch_preserved,
        "originalMediaMutated": False,
    }, indent=2, sort_keys=True))
    if not passed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
