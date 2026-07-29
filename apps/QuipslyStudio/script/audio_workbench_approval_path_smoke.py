#!/usr/bin/env python3
"""Smoke-test the post-human-approval path in a sandbox.

The real v006 manifest must remain unapproved until a human listen decision is
recorded. This script copies the manifest into a sandbox, records an approval
there, refreshes the branch gate and branch-render preflight there, and verifies
that the approved branch-render executor would expose dry-run branch commands.

Only the final smoke report is registered on the real manifest.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n")


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def run_step(name: str, args: list[str], cwd: Path) -> dict[str, Any]:
    result = subprocess.run(args, cwd=cwd, text=True, capture_output=True)
    parsed: Any = None
    if result.stdout.strip():
        try:
            parsed = json.loads(result.stdout)
        except json.JSONDecodeError:
            parsed = None
    return {
        "name": name,
        "args": args,
        "returncode": result.returncode,
        "stdout": result.stdout.strip(),
        "stderr": result.stderr.strip(),
        "parsedStdout": parsed,
        "ok": result.returncode == 0,
    }


def output_path(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        path = value.get("path")
        if isinstance(path, str):
            return path
    return None


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def write_open_command(path: Path, target: Path) -> None:
    path.write_text(
        "\n".join(
            [
                "#!/bin/sh",
                "set -e",
                "open " + shell_quote(str(target)),
                "",
            ]
        ),
        encoding="utf-8",
    )
    path.chmod(0o755)


SANDBOX_EVIDENCE_FILES = (
    "episode4-mastered-audio-spine-v006.m4a",
    "episode4-mastered-audio-spine-v006.wav",
    "AUDIO_FINAL_LISTEN_MISSION_PACKET.html",
    "AUDIO_FINAL_LISTEN_MISSION_PACKET.json",
    "AUDIO_SOURCE_AWARE_STEM_MANIFEST.html",
    "AUDIO_SOURCE_AWARE_STEM_MANIFEST.json",
    "AUDIO_SOURCE_AWARE_TIMING_CONTRACT.html",
    "AUDIO_SOURCE_AWARE_TIMING_CONTRACT.json",
    "AUDIO_SEGMENT_LOUDNESS_MAP.html",
    "AUDIO_SEGMENT_LOUDNESS_MAP.json",
    "EPISODE_4_POST_APPROVAL_RENDER_REHEARSAL.html",
    "EPISODE_4_POST_APPROVAL_RENDER_REHEARSAL.json",
    "POST_LISTEN_OUTCOME_ROUTER.html",
    "POST_LISTEN_OUTCOME_ROUTER.json",
    "BRANCH_RENDER_PREFLIGHT.html",
    "BRANCH_RENDER_PREFLIGHT.json",
    "START_HERE_EPISODE_4_AUDIO_REVIEW.md",
    "EPISODE_4_AUDIO_REVIEW_STATUS.md",
    "AUDIO_MANIFEST_READBACK_CONSISTENCY_SMOKE.json",
)


def seed_sandbox_evidence(source_dir: Path, sandbox_dir: Path) -> dict[str, Any]:
    """Give the sandbox enough package evidence to run approval preflight.

    Media files are symlinked to avoid copying huge handoff artifacts. Control
    JSON/HTML/Markdown files are copied instead of symlinked because some smoke
    steps regenerate stable filenames inside the sandbox, and writing through a
    symlink would mutate the real baseline. That is exactly the sort of haunted
    attic gremlin this smoke exists to prevent.
    """
    seeded: list[dict[str, str]] = []
    missing: list[str] = []
    for filename in SANDBOX_EVIDENCE_FILES:
        source = source_dir / filename
        target = sandbox_dir / filename
        if not source.exists():
            missing.append(str(source))
            continue
        if target.exists() or target.is_symlink():
            target.unlink()
        if source.suffix.lower() in {".wav", ".m4a", ".mp3", ".mp4", ".mov"}:
            target.symlink_to(source)
            mode = "symlink"
        else:
            shutil.copy2(source, target)
            mode = "copy"
        seeded.append({"filename": filename, "mode": mode, "source": str(source), "target": str(target)})
    return {"seeded": seeded, "missing": missing}


def build_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Approval Path Smoke: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This is a sandboxed rehearsal. It does not approve the real baseline and it does not render branches.",
        "",
        "## Verdict",
        "",
        f"- Smoke passed: `{str(report['smokePassed']).lower()}`",
        f"- Real manifest approval preserved: `{str(report['realManifestApprovalPreserved']).lower()}`",
        f"- Sandbox branch inheritance ready: `{str(report['sandboxBranchInheritanceReady']).lower()}`",
        f"- Sandbox branch render ready: `{str(report['sandboxBranchRenderReady']).lower()}`",
        f"- Sandbox source-aware branch gate ready: `{str(report['sandboxSourceAwareBranchGateReady']).lower()}`",
        f"- Sandbox branch audio truth: `{report['sandboxBranchRenderAudioTruth']}`",
        f"- Sandbox executor uses refined stems: `{str(report['sandboxExecutorWillUseRefinedStems']).lower()}`",
        f"- Sandbox master-only editing prevented: `{str(report['sandboxExecutorMasterOnlyPrevented']).lower()}`",
        f"- Sandbox executor commands exposed: `{str(report['sandboxExecutorCommandsExposed']).lower()}`",
        f"- Sandbox evidence seeded: `{report['sandboxEvidenceSeededCount']}`",
        f"- Sandbox evidence missing: `{report['sandboxEvidenceMissingCount']}`",
        "",
        "## Sandbox",
        "",
        f"- Sandbox dir: `{report['sandboxDir']}`",
        f"- Sandbox manifest: `{report['sandboxManifest']}`",
        "",
        "## Steps",
        "",
        "| Step | OK | Return code |",
        "|---|---:|---:|",
    ]
    for step in report["steps"]:
        lines.append(f"| {step['name']} | `{str(step['ok']).lower()}` | `{step['returncode']}` |")
    if report["errors"]:
        lines.extend(["", "## Errors", ""])
        lines.extend(f"- {error}" for error in report["errors"])
    lines.extend(
        [
            "",
            "## Next safest action",
            "",
            report["nextSafestAction"],
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--keep-sandbox", action="store_true", help="Keep sandbox files for inspection. Default is also to keep a versioned sandbox under the baseline dir.")
    args = parser.parse_args()

    baseline_dir = args.baseline_dir.expanduser().resolve()
    manifest_path = baseline_dir / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit(f"Missing manifest: {manifest_path}")

    root = repo_root()
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    real_manifest_before_text = manifest_path.read_text()
    real_manifest_before = json.loads(real_manifest_before_text)
    baseline_id = str(real_manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    sandbox_root = baseline_dir / f"approval-path-smoke-{slug}-{generated_at}"
    sandbox_dir = sandbox_root / "sandbox-baseline"
    sandbox_dir.mkdir(parents=True, exist_ok=False)
    shutil.copy2(manifest_path, sandbox_dir / "manifest.json")
    sandbox_evidence = seed_sandbox_evidence(baseline_dir, sandbox_dir)

    recorder = root / "apps" / "QuipslyStudio" / "script" / "audio_workbench_record_listen_decision.py"
    gate = root / "apps" / "QuipslyStudio" / "script" / "audio_workbench_branch_gate.py"
    preflight = root / "apps" / "QuipslyStudio" / "script" / "audio_workbench_branch_render_preflight.py"
    executor = root / "apps" / "QuipslyStudio" / "script" / "audio_workbench_approved_branch_render_executor.py"

    steps = [
        run_step(
            "record sandbox approval",
            [
                "python3",
                str(recorder),
                "--baseline-dir",
                str(sandbox_dir),
                "--status",
                "human-approved-for-branch-inheritance",
                "--reviewer",
                "Approval path smoke",
                "--notes",
                "Sandbox-only approval path smoke. This does not approve the real v006 baseline.",
                "--confirm-human-listened",
            ],
            root,
        )
    ]
    steps.append(run_step("refresh sandbox branch gate", ["python3", str(gate), "--baseline-dir", str(sandbox_dir)], root))
    steps.append(
        run_step(
            "refresh sandbox branch-render preflight",
            ["python3", str(preflight), "--baseline-dir", str(sandbox_dir)],
            root,
        )
    )
    steps.append(
        run_step(
            "plan sandbox approved branch render",
            ["python3", str(executor), "--baseline-dir", str(sandbox_dir)],
            root,
        )
    )

    real_manifest_after_steps_text = manifest_path.read_text()
    real_manifest_after_steps = json.loads(real_manifest_after_steps_text)
    sandbox_manifest = load_json(sandbox_dir / "manifest.json")
    sandbox_outputs = sandbox_manifest.get("outputs") or {}
    sandbox_executor_path = output_path(sandbox_outputs.get("latestApprovedBranchRenderExecutor"))
    sandbox_executor = load_json(Path(sandbox_executor_path)) if sandbox_executor_path and Path(sandbox_executor_path).exists() else {}

    real_approval_preserved = (
        real_manifest_after_steps.get("approvalStatus") == real_manifest_before.get("approvalStatus")
        and real_manifest_after_steps.get("branchInheritanceReady") == real_manifest_before.get("branchInheritanceReady")
        and real_manifest_after_steps.get("branchRenderReady") == real_manifest_before.get("branchRenderReady")
    )
    sandbox_branch_ready = bool(sandbox_manifest.get("branchInheritanceReady"))
    sandbox_render_ready = bool(sandbox_manifest.get("branchRenderReady"))
    sandbox_commands_exposed = bool(sandbox_executor.get("commandsExposed"))
    sandbox_source_aware_branch_gate_ready = bool(
        sandbox_manifest.get("branchInheritanceGateSourceAwareBranchContractReady")
    )
    sandbox_branch_audio_truth = str(sandbox_manifest.get("branchRenderAudioTruth") or "")
    sandbox_executor_source_aware_ready = bool(sandbox_executor.get("sourceAwareRenderContractReady"))
    sandbox_executor_will_use_refined_stems = bool(
        sandbox_executor.get("sourceAwareBranchRenderWillUseRefinedStems")
    )
    sandbox_executor_master_only_prevented = bool(
        sandbox_executor.get("masteredSpineOnlyBranchRenderPrevented")
    )
    sandbox_executor_audio_truth = str(sandbox_executor.get("branchRenderAudioTruth") or "")

    errors: list[str] = []
    for step in steps:
        if not step["ok"]:
            errors.append(f"Step failed: {step['name']}")
    if not real_approval_preserved:
        errors.append("Real manifest approval/branch gate state changed during sandbox smoke")
    if not sandbox_branch_ready:
        errors.append("Sandbox branch inheritance did not become ready")
    if not sandbox_render_ready:
        errors.append("Sandbox branch render did not become ready")
    if not sandbox_commands_exposed:
        errors.append("Sandbox executor did not expose approved render commands")
    if not sandbox_source_aware_branch_gate_ready:
        errors.append("Sandbox branch gate did not prove source-aware branch inheritance")
    if sandbox_branch_audio_truth != "source-aware-refined-stems":
        errors.append(f"Sandbox manifest branch audio truth is unsafe: {sandbox_branch_audio_truth or 'missing'}")
    if not sandbox_executor_source_aware_ready:
        errors.append("Sandbox executor did not prove ready source-aware render contract")
    if not sandbox_executor_will_use_refined_stems:
        errors.append("Sandbox executor did not promise source-aware refined stems")
    if not sandbox_executor_master_only_prevented:
        errors.append("Sandbox executor did not prevent mastered-spine-only branch rendering")
    if sandbox_executor_audio_truth != "source-aware-refined-stems":
        errors.append(f"Sandbox executor branch audio truth is unsafe: {sandbox_executor_audio_truth or 'missing'}")
    if sandbox_evidence["missing"]:
        errors.append(f"Sandbox evidence missing {len(sandbox_evidence['missing'])} required files")

    report = {
        "schema": "quipsly.audio-workbench.approval-path-smoke.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "status": "passed" if not errors else "failed",
        "passed": not errors,
        "sandboxDir": str(sandbox_dir),
        "sandboxManifest": str(sandbox_dir / "manifest.json"),
        "realManifestApprovalPreserved": real_approval_preserved,
        "realApprovalStatusBefore": real_manifest_before.get("approvalStatus"),
        "realApprovalStatusAfterSmoke": real_manifest_after_steps.get("approvalStatus"),
        "sandboxApprovalStatus": sandbox_manifest.get("approvalStatus"),
        "sandboxBranchInheritanceReady": sandbox_branch_ready,
        "sandboxBranchRenderReady": sandbox_render_ready,
        "sandboxSourceAwareBranchGateReady": sandbox_source_aware_branch_gate_ready,
        "sandboxBranchRenderAudioTruth": sandbox_branch_audio_truth,
        "sandboxExecutorSourceAwareRenderContractReady": sandbox_executor_source_aware_ready,
        "sandboxExecutorWillUseRefinedStems": sandbox_executor_will_use_refined_stems,
        "sandboxExecutorMasterOnlyPrevented": sandbox_executor_master_only_prevented,
        "sandboxExecutorBranchRenderAudioTruth": sandbox_executor_audio_truth,
        "sandboxExecutorCommandsExposed": sandbox_commands_exposed,
        "sandboxExecutorStatus": sandbox_executor.get("status"),
        "sandboxEvidenceSeeded": sandbox_evidence["seeded"],
        "sandboxEvidenceMissing": sandbox_evidence["missing"],
        "sandboxEvidenceSeededCount": len(sandbox_evidence["seeded"]),
        "sandboxEvidenceMissingCount": len(sandbox_evidence["missing"]),
        "smokePassed": not errors,
        "steps": steps,
        "errors": errors,
        "nextSafestAction": (
            "After a real human listen pass, record approval on the real baseline, refresh branch gate and preflight, then regenerate the approved branch-render executor."
            if not errors
            else "Fix approval-path smoke errors before relying on post-approval branch rendering automation."
        ),
    }

    output_json = baseline_dir / f"audio-approval-path-smoke-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"audio-approval-path-smoke-{slug}-{generated_at}.md"
    stable_json = baseline_dir / "APPROVAL_PATH_SMOKE.json"
    stable_md = baseline_dir / "APPROVAL_PATH_SMOKE.md"
    stable_open_command = baseline_dir / "OPEN_APPROVAL_PATH_SMOKE.command"
    markdown = build_markdown(report) + "\n"
    output_json.write_text(json.dumps(report, indent=2) + "\n")
    output_md.write_text(markdown)
    stable_json.write_text(json.dumps(report, indent=2) + "\n")
    stable_md.write_text(markdown)
    write_open_command(stable_open_command, stable_md)

    real_manifest = load_json(manifest_path)
    outputs = real_manifest.setdefault("outputs", {})
    outputs["latestApprovalPathSmoke"] = str(stable_json)
    outputs["latestApprovalPathSmokeMarkdown"] = str(stable_md)
    outputs["latestApprovalPathSmokeOpenCommand"] = str(stable_open_command)
    outputs["latestApprovalPathSmokeVersioned"] = str(output_json)
    outputs["latestApprovalPathSmokeVersionedMarkdown"] = str(output_md)
    history = outputs.setdefault("approvalPathSmokes", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    real_manifest["latestApprovalPathSmokeGeneratedAt"] = generated_at
    real_manifest["approvalPathSmokeCount"] = len(history)
    real_manifest["approvalPathSmokeStatus"] = report["status"]
    real_manifest["approvalPathSmokePassed"] = not errors
    real_manifest["approvalPathSmokeRealManifestApprovalPreserved"] = real_approval_preserved
    write_json(manifest_path, real_manifest)

    print(f"Wrote {output_md}")
    print(f"Wrote {output_json}")
    print(f"Wrote {stable_md}")
    print(f"Wrote {stable_open_command}")
    print(f"Smoke passed: {not errors}")
    print(f"Real manifest approval preserved: {real_approval_preserved}")


if __name__ == "__main__":
    main()
