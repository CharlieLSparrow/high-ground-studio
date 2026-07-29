#!/usr/bin/env python3
"""Rehearse the final human-listen decision paths for an audio baseline.

This is a control-plane proof tool, not an approval tool. It dry-runs the
recorded-listen decision commands for approve, fail, and needs-focused-proof,
verifies those dry-runs do not change the real manifest, and writes a clear
reviewer/agent handoff artifact.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
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
    raise FileNotFoundError(
        "Could not find manifest.json at "
        f"{input_path}/manifest.json or {nested}/manifest.json"
    )


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def output_path(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in ("path", "markdownPath", "htmlPath", "jsonPath"):
            path = value.get(key)
            if isinstance(path, str):
                return path
    return None


def safe_slug(value: str) -> str:
    out = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in value.lower())
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def command_block(lines: list[str]) -> list[str]:
    return ["```bash", *lines, "```"]


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run_step(label: str, args: list[str]) -> dict[str, Any]:
    result = subprocess.run(args, cwd=repo_root(), text=True, capture_output=True)
    parsed_stdout: Any = None
    if result.stdout.strip():
        try:
            parsed_stdout = json.loads(result.stdout)
        except json.JSONDecodeError:
            parsed_stdout = None
    return {
        "label": label,
        "args": args,
        "returncode": result.returncode,
        "ok": result.returncode == 0,
        "stdout": result.stdout.strip(),
        "stderr": result.stderr.strip(),
        "parsedStdout": parsed_stdout,
    }


def artifact(outputs: dict[str, Any], label: str, key: str) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    exists = bool(path) and Path(path).exists()
    return {
        "label": label,
        "key": key,
        "path": path,
        "exists": exists,
        "sizeBytes": Path(path).stat().st_size if exists and path else None,
    }


def load_report(outputs: dict[str, Any], key: str) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    if not path or not Path(path).exists() or Path(path).suffix.lower() != ".json":
        return {"key": key, "path": path, "exists": bool(path and Path(path).exists())}
    try:
        payload = read_json(Path(path))
    except json.JSONDecodeError:
        return {"key": key, "path": path, "exists": True, "jsonError": True}
    summary_keys = [
        "schema",
        "status",
        "passed",
        "matchingCandidateCount",
        "selectedCandidate",
        "validNotesPacketCount",
        "repairActionCount",
        "focusedProofActionCount",
        "passContextItemCount",
        "allStepsOk",
        "errorCount",
        "warningCount",
        "missingArtifactCount",
        "approvalStateChanged",
        "branchStateChanged",
        "renderAttempted",
        "originalMediaMutated",
    ]
    summary = {name: payload.get(name) for name in summary_keys if name in payload}
    return {"key": key, "path": path, "exists": True, "summary": summary}


def build_decision_commands(baseline_dir: Path) -> dict[str, list[str]]:
    baseline = str(baseline_dir)
    return {
        "approveForBranchInheritanceDryRun": [
            "python3",
            "apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py",
            "--baseline-dir",
            baseline,
            "--status",
            "human-approved-for-branch-inheritance",
            "--reviewer",
            "Charlie or Mako",
            "--notes",
            "Human listened to v006 review package and approved it for edit branch inheritance.",
            "--confirm-human-listened",
            "--dry-run",
        ],
        "failHumanListenDryRun": [
            "python3",
            "apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py",
            "--baseline-dir",
            baseline,
            "--status",
            "failed-human-listen",
            "--reviewer",
            "Charlie or Mako",
            "--notes",
            "Human listen found a problem; preserve this candidate and route a scoped v007 or timestamped repair.",
            "--issue",
            "Describe the failing timestamp, artifact, or source-balance/speaker-cleanup concern here.",
            "--confirm-human-listened",
            "--dry-run",
        ],
        "needsFocusedProofDryRun": [
            "python3",
            "apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py",
            "--baseline-dir",
            baseline,
            "--status",
            "needs-focused-proof",
            "--reviewer",
            "Charlie or Mako",
            "--notes",
            "Reviewer needs a narrower proof window before approving or failing the whole v006 spine.",
            "--issue",
            "Describe the timestamp/window that needs focused proof here.",
            "--dry-run",
        ],
    }


def display_command(args: list[str]) -> list[str]:
    if len(args) < 2:
        return [" ".join(args)]
    lines = [args[0] + " " + args[1] + " \\"]
    pairs = args[2:]
    i = 0
    rendered: list[str] = []
    while i < len(pairs):
        item = pairs[i]
        if item.startswith("--") and i + 1 < len(pairs) and not pairs[i + 1].startswith("--"):
            rendered.append(f"  {item} {shell_quote(pairs[i + 1])}")
            i += 2
        else:
            rendered.append(f"  {item}")
            i += 1
    for idx, item in enumerate(rendered):
        suffix = " \\" if idx < len(rendered) - 1 else ""
        lines.append(item + suffix)
    return lines


def build_open_command(markdown_path: Path) -> str:
    return "\n".join(
        [
            "#!/bin/zsh",
            "set -euo pipefail",
            "open " + shell_quote(str(markdown_path)),
            "",
        ]
    )


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Human Listen Decision Rehearsal: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This is a rehearsal only. It dry-runs the final human-listen decision commands and proves the real v006 manifest stays locked until an explicit non-dry-run human decision is recorded.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{report['truthAfterDryRuns']['approvalStatus']}`",
        f"- Package ready for human listen: `{str(report['truthAfterDryRuns']['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(report['truthAfterDryRuns']['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['truthAfterDryRuns']['branchRenderReady']).lower()}`",
        f"- Dry-run commands OK: `{str(report['dryRunCommandsOk']).lower()}`",
        f"- Dry-run manifest unchanged: `{str(report['dryRunManifestUnchanged']).lower()}`",
        f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
        f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
        f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Human decision paths rehearsed",
        "",
    ]
    for step in report["dryRuns"]:
        lines.extend(
            [
                f"### {step['label']}",
                "",
                f"- OK: `{str(step['ok']).lower()}`",
                f"- Return code: `{step['returncode']}`",
                "",
                *command_block(display_command(step["args"])),
                "",
            ]
        )
        parsed = step.get("parsedStdout")
        if isinstance(parsed, dict):
            lines.extend(
                [
                    f"Planned status: `{parsed.get('decisionStatus')}`; dry run: `{str(parsed.get('dryRun')).lower()}`",
                    "",
                ]
            )
        if step.get("stderr"):
            lines.extend(["stderr:", "", "```", str(step["stderr"]), "```", ""])
    lines.extend(
        [
            "## Review surfaces to use before any non-dry-run decision",
            "",
            "| Surface | Exists | Path |",
            "|---|---:|---|",
        ]
    )
    for item in report["reviewArtifacts"]:
        lines.append(f"| {item['label']} | `{str(item['exists']).lower()}` | `{item.get('path') or 'not registered'}` |")
    lines.extend(["", "## Current notes and routing state", "", "| Report | Exists | Summary |", "|---|---:|---|"])
    for item in report["routingReports"]:
        summary = item.get("summary") or {}
        summary_text = ", ".join(f"{key}={value}" for key, value in summary.items()) or "no JSON summary"
        lines.append(f"| `{item['key']}` | `{str(item.get('exists')).lower()}` | {summary_text} |")
    lines.extend(
        [
            "",
            "## Actual guarded commands after human listening",
            "",
            "Use these only after a real human listen. Remove `--dry-run` deliberately; do not hand-edit `manifest.json`.",
            "",
            "### If v006 passes for edit-branch inheritance",
            "",
            *command_block(display_command([arg for arg in report["commands"]["approveForBranchInheritanceDryRun"] if arg != "--dry-run"])),
            "",
            "### If v006 fails human listening",
            "",
            *command_block(display_command([arg for arg in report["commands"]["failHumanListenDryRun"] if arg != "--dry-run"])),
            "",
            "### If v006 needs focused proof before pass/fail",
            "",
            *command_block(display_command([arg for arg in report["commands"]["needsFocusedProofDryRun"] if arg != "--dry-run"])),
            "",
            "## Next safest step",
            "",
            report["nextSafestStep"],
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--goal-file", type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    before = read_json(manifest_path)
    before_hash = file_sha256(manifest_path)
    outputs = before.setdefault("outputs", {})
    baseline_id = str(before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    commands = build_decision_commands(baseline_dir)
    dry_runs = [run_step(label, command) for label, command in commands.items()]
    after_dry_run = read_json(manifest_path)
    after_dry_hash = file_sha256(manifest_path)

    review_artifacts = [
        artifact(outputs, "Listening M4A", "masterM4a"),
        artifact(outputs, "Handoff WAV", "masterWav"),
        artifact(outputs, "Stable START HERE", "latestAudioReviewStartHereMarkdown"),
        artifact(outputs, "Human listen control room", "latestAudioHumanListenControlRoomHtml"),
        artifact(outputs, "Human listen decision brief", "latestAudioHumanListenDecisionBriefMarkdown"),
        artifact(outputs, "Listen-priority review reel", "latestAudioListenPriorityReviewReelMarkdown"),
        artifact(outputs, "Speaker cleanup proof pack", "latestSpeakerCleanupProofPackMarkdown"),
        artifact(outputs, "Speaker cleanup listen map", "latestSpeakerCleanupListenMapMarkdown"),
        artifact(outputs, "Audio review gate audit", "latestAudioReviewGateAuditMarkdown"),
        artifact(outputs, "Post-human-listen notes roundtrip", "latestAudioPostHumanListenNotesRoundtripMarkdown"),
        artifact(outputs, "Review handoff index", "latestReviewHandoffIndexMarkdown"),
    ]
    routing_reports = [
        load_report(outputs, "latestAudioListenPriorityNotesInbox"),
        load_report(outputs, "latestSpeakerCleanupListenMapNotesInbox"),
        load_report(outputs, "latestMarkerReviewNotesInbox"),
        load_report(outputs, "latestAudioListenNotesRepairPlanner"),
        load_report(outputs, "latestAudioPostHumanListenNotesRoundtrip"),
        load_report(outputs, "latestAudioReviewGateAudit"),
    ]

    output_dir = baseline_dir / f"human-listen-decision-rehearsal-{slug}-{generated_at}"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_json = output_dir / "human-listen-decision-rehearsal.json"
    output_md = output_dir / "human-listen-decision-rehearsal.md"
    command_path = output_dir / "open-human-listen-decision-rehearsal.command"

    approval_state_changed = before.get("approvalStatus") != after_dry_run.get("approvalStatus")
    branch_state_changed = bool(before.get("branchInheritanceReady")) != bool(after_dry_run.get("branchInheritanceReady")) or bool(before.get("branchRenderReady")) != bool(after_dry_run.get("branchRenderReady"))
    dry_run_commands_ok = all(step["ok"] for step in dry_runs)
    dry_run_manifest_unchanged = before_hash == after_dry_hash

    report = {
        "schema": "quipsly.audio-workbench.human-listen-decision-rehearsal.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "goalFile": str(args.goal_file.expanduser().resolve()) if args.goal_file else None,
        "truthBefore": {
            "approvalStatus": before.get("approvalStatus"),
            "packageReadyForHumanListen": bool(before.get("packageReadyForHumanListen")),
            "branchInheritanceReady": bool(before.get("branchInheritanceReady")),
            "branchRenderReady": bool(before.get("branchRenderReady")),
        },
        "truthAfterDryRuns": {
            "approvalStatus": after_dry_run.get("approvalStatus"),
            "packageReadyForHumanListen": bool(after_dry_run.get("packageReadyForHumanListen")),
            "branchInheritanceReady": bool(after_dry_run.get("branchInheritanceReady")),
            "branchRenderReady": bool(after_dry_run.get("branchRenderReady")),
        },
        "commands": commands,
        "dryRuns": dry_runs,
        "dryRunCommandsOk": dry_run_commands_ok,
        "dryRunManifestUnchanged": dry_run_manifest_unchanged,
        "reviewArtifacts": review_artifacts,
        "routingReports": routing_reports,
        "approvalStateChanged": approval_state_changed,
        "branchStateChanged": branch_state_changed,
        "renderAttempted": False,
        "originalMediaMutated": False,
        "passed": dry_run_commands_ok and dry_run_manifest_unchanged and not approval_state_changed and not branch_state_changed,
        "nextSafestStep": "A human should open START_HERE or the human listen control room, listen to the v006 review material, export notes if useful, then use the rehearsed guarded command path to approve, fail, or request focused proof.",
        "markdown": str(output_md),
        "openCommand": str(command_path),
    }

    write_json(output_json, report)
    output_md.write_text(render_markdown(report) + "\n", encoding="utf-8")
    command_path.write_text(build_open_command(output_md), encoding="utf-8")
    os.chmod(command_path, 0o755)

    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestHumanListenDecisionRehearsal"] = str(output_json)
    outputs["latestHumanListenDecisionRehearsalMarkdown"] = str(output_md)
    outputs["latestHumanListenDecisionRehearsalOpenCommand"] = str(command_path)
    history = outputs.setdefault("humanListenDecisionRehearsals", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["humanListenDecisionRehearsalCount"] = len(history)
    manifest["humanListenDecisionRehearsalPassed"] = bool(report["passed"])
    write_json(manifest_path, manifest)

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "passed": report["passed"],
                "dryRunCommandsOk": dry_run_commands_ok,
                "dryRunManifestUnchanged": dry_run_manifest_unchanged,
                "approvalStateChanged": approval_state_changed,
                "branchStateChanged": branch_state_changed,
                "markdown": str(output_md),
                "openCommand": str(command_path),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
