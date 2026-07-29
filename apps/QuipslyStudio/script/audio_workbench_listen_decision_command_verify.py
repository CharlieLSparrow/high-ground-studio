#!/usr/bin/env python3
"""Verify listen-decision recorder command paths without approving audio.

This runs the approval and failure decision recorder in --dry-run mode, confirms
the dry-runs do not mutate the baseline manifest, and records a small evidence
artifact. It is meant to make the human-listen handoff safer, not to replace
human listening.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def run_command(args: list[str], cwd: Path) -> dict[str, Any]:
    result = subprocess.run(args, cwd=cwd, text=True, capture_output=True)
    parsed: Any = None
    if result.stdout.strip():
        try:
            parsed = json.loads(result.stdout)
        except json.JSONDecodeError:
            parsed = None
    return {
        "args": args,
        "returncode": result.returncode,
        "stdout": result.stdout.strip(),
        "stderr": result.stderr.strip(),
        "parsedStdout": parsed,
        "ok": result.returncode == 0,
    }


def build_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Listen Decision Command Verification: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This verifies dry-run command behavior only. It does not approve or reject the audio.",
        "",
        "## Verdict",
        "",
        f"- Commands valid: `{str(report['commandsValid']).lower()}`",
        f"- Manifest unchanged by dry-runs: `{str(report['manifestUnchangedByDryRuns']).lower()}`",
        f"- Approval dry-run OK: `{str(report['approvalDryRun']['ok']).lower()}`",
        f"- Failure dry-run OK: `{str(report['failureDryRun']['ok']).lower()}`",
        "",
        "## Approval dry-run",
        "",
        "```bash",
        " ".join(report["approvalDryRun"]["args"]),
        "```",
        "",
        "## Failure dry-run",
        "",
        "```bash",
        " ".join(report["failureDryRun"]["args"]),
        "```",
        "",
        "## Next safest action",
        "",
        report["nextSafestAction"],
        "",
    ]
    if report["errors"]:
        lines.extend(["## Errors", ""])
        lines.extend(f"- {error}" for error in report["errors"])
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = args.baseline_dir.expanduser().resolve()
    manifest_path = baseline_dir / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit(f"Missing manifest: {manifest_path}")

    root = repo_root()
    recorder = root / "apps" / "QuipslyStudio" / "script" / "audio_workbench_record_listen_decision.py"
    if not recorder.exists():
        raise SystemExit(f"Missing recorder script: {recorder}")

    manifest_before = manifest_path.read_text()
    manifest = json.loads(manifest_before)
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    base_args = ["python3", str(recorder), "--baseline-dir", str(baseline_dir)]
    approval_args = [
        *base_args,
        "--status",
        "human-approved-for-branch-inheritance",
        "--reviewer",
        "Command verifier",
        "--notes",
        "Dry-run only: verifies approval command shape after a real human listen pass.",
        "--confirm-human-listened",
        "--dry-run",
    ]
    failure_args = [
        *base_args,
        "--status",
        "failed-human-listen",
        "--reviewer",
        "Command verifier",
        "--notes",
        "Dry-run only: verifies failure command shape for a rejected listen pass.",
        "--issue",
        "Dry-run issue placeholder; replace with real failing window or artifact.",
        "--confirm-human-listened",
        "--dry-run",
    ]

    approval = run_command(approval_args, root)
    failure = run_command(failure_args, root)
    manifest_after_dry_runs = manifest_path.read_text()
    unchanged = manifest_before == manifest_after_dry_runs

    errors: list[str] = []
    if not approval["ok"]:
        errors.append("Approval dry-run command failed")
    if not failure["ok"]:
        errors.append("Failure dry-run command failed")
    if not unchanged:
        errors.append("Manifest changed during listen-decision dry-runs")
    if (approval.get("parsedStdout") or {}).get("dryRun") is not True:
        errors.append("Approval dry-run output did not declare dryRun=true")
    if (failure.get("parsedStdout") or {}).get("dryRun") is not True:
        errors.append("Failure dry-run output did not declare dryRun=true")

    report = {
        "schema": "quipsly.audio-workbench.listen-decision-command-verification.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "commandsValid": not errors,
        "manifestUnchangedByDryRuns": unchanged,
        "approvalDryRun": approval,
        "failureDryRun": failure,
        "errors": errors,
        "nextSafestAction": (
            "Use the same recorder command without --dry-run only after a real human listen pass. "
            "Then refresh the branch inheritance gate and post-listen next-actions plan."
            if not errors
            else "Fix the command path before asking reviewers to record pass/fail decisions."
        ),
    }

    output_json = baseline_dir / f"audio-listen-decision-command-verification-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"audio-listen-decision-command-verification-{slug}-{generated_at}.md"
    output_json.write_text(json.dumps(report, indent=2) + "\n")
    output_md.write_text(build_markdown(report) + "\n")

    manifest = load_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestListenDecisionCommandVerification"] = str(output_json)
    outputs["latestListenDecisionCommandVerificationMarkdown"] = str(output_md)
    history = outputs.setdefault("listenDecisionCommandVerifications", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["latestListenDecisionCommandVerificationGeneratedAt"] = generated_at
    manifest["listenDecisionCommandVerificationCount"] = len(history)
    manifest["listenDecisionCommandsValid"] = not errors
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

    print(f"Wrote {output_md}")
    print(f"Wrote {output_json}")
    print(f"Commands valid: {not errors}")
    print(f"Manifest unchanged by dry-runs: {unchanged}")


if __name__ == "__main__":
    main()
