#!/usr/bin/env python3
"""Process exported human-listen notes through the safe audio review control plane.

This is the "I exported notes, now make Quipsly notice them" helper. It runs
the notes inboxes, repair planner, status board, gate audit, outcome router,
START_HERE refresh, and handoff index in the correct order.

It does not approve audio, fail audio, render branches, upload files, or mutate
original media. Any approval/failure command remains guarded and explicit in the
generated inbox/bridge artifacts.
"""

from __future__ import annotations

import argparse
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
        path = value.get("path") or value.get("markdownPath") or value.get("htmlPath")
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


def parse_stdout(stdout: str) -> Any:
    text = stdout.strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def run_step(label: str, args: list[str]) -> dict[str, Any]:
    result = subprocess.run(args, cwd=repo_root(), text=True, capture_output=True)
    return {
        "label": label,
        "args": args,
        "returncode": result.returncode,
        "ok": result.returncode == 0,
        "stdout": result.stdout.strip(),
        "stderr": result.stderr.strip(),
        "parsedStdout": parse_stdout(result.stdout),
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


def build_open_command(*, baseline_dir: Path, goal_file: Path | None) -> str:
    lines = [
        "#!/bin/zsh",
        "set -euo pipefail",
        "",
        "cd " + shell_quote(str(repo_root())),
        "OUT=" + shell_quote(str(baseline_dir)),
        "echo 'Processing exported Episode 4 audio review notes...'",
        "python3 apps/QuipslyStudio/script/audio_workbench_post_human_listen_notes_roundtrip.py \\",
        '  --baseline-dir "$OUT" \\',
    ]
    if goal_file:
        lines.append("  --goal-file " + shell_quote(str(goal_file)) + " \\")
    lines[-1] = lines[-1].rstrip(" \\")
    lines.extend(["", "echo 'Done. Opening refreshed START_HERE and roundtrip report...'", "open \"$OUT/START_HERE_EPISODE_4_AUDIO_REVIEW.md\""])
    return "\n".join(lines) + "\n"


def build_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Post-human-listen notes roundtrip",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        "",
        "This is the safe one-command bridge after a reviewer exports notes from the listen-priority console, marker console, or human-listen control room. It refreshes inboxes and control-plane reports. It does not approve, fail, render, upload, or mutate source media.",
        "",
        "## Current truth after roundtrip",
        "",
        f"- Approval status: `{report['truthAfter']['approvalStatus']}`",
        f"- Branch inheritance ready: `{str(report['truthAfter']['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['truthAfter']['branchRenderReady']).lower()}`",
        f"- Approval state changed by this script: `{str(report['approvalStateChanged']).lower()}`",
        f"- Branch state changed by this script: `{str(report['branchStateChanged']).lower()}`",
        f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Step results",
        "",
        "| Step | OK | Return code |",
        "|---|---:|---:|",
    ]
    for step in report["steps"]:
        lines.append(f"| {step['label']} | {str(step['ok']).lower()} | {step['returncode']} |")
    lines.extend(["", "## Important refreshed artifacts", "", "| Artifact | Exists | Path |", "|---|---:|---|"])
    for item in report["artifacts"]:
        lines.append(f"| {item['label']} | {str(item['exists']).lower()} | `{item['path'] or 'not registered'}` |")
    lines.extend(
        [
            "",
            "## Re-run command",
            "",
            *command_block(report["commands"]["rerun"]),
            "",
            "## Guardrail",
            "",
            "If exported notes are all-pass, use the guarded command from the notes inbox to record approval with explicit human-listen confirmation. If notes require repair or proof, use the repair planner output. This roundtrip only refreshes the evidence board.",
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
    goal_file = args.goal_file.expanduser().resolve() if args.goal_file else None
    manifest_path = baseline_dir / "manifest.json"
    before = read_json(manifest_path)
    baseline_id = str(before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    steps: list[dict[str, Any]] = []
    common = ["--baseline-dir", str(baseline_dir)]
    scripts = [
        ("listen-priority/control-room notes inbox", ["python3", "apps/QuipslyStudio/script/audio_workbench_listen_priority_notes_inbox.py", *common]),
        ("speaker-cleanup listen-map notes inbox", ["python3", "apps/QuipslyStudio/script/audio_workbench_speaker_cleanup_listen_map_notes_inbox.py", *common]),
        ("speaker-preservation proof notes inbox", ["python3", "apps/QuipslyStudio/script/audio_workbench_speaker_preservation_notes_inbox.py", *common]),
        ("final listen fast-pass notes inbox", ["python3", "apps/QuipslyStudio/script/audio_workbench_final_listen_fast_pass_notes_inbox.py", *common]),
        ("smoothness proof notes inbox", ["python3", "apps/QuipslyStudio/script/audio_workbench_smoothness_proof_notes_inbox.py", *common]),
        ("technical audition notes inbox", ["python3", "apps/QuipslyStudio/script/audio_workbench_technical_audition_notes_inbox.py", *common]),
        ("parameter-sweep proof notes inbox", ["python3", "apps/QuipslyStudio/script/audio_workbench_parameter_sweep_notes_inbox.py", *common]),
        ("producer-grade audio audit", ["python3", "apps/QuipslyStudio/script/audio_workbench_producer_grade_audit.py", *common]),
        ("producer-grade notes inbox", ["python3", "apps/QuipslyStudio/script/audio_workbench_producer_grade_notes_inbox.py", *common]),
        ("marker-review notes inbox", ["python3", "apps/QuipslyStudio/script/audio_workbench_marker_review_notes_inbox.py", *common]),
        ("listen-notes repair planner", ["python3", "apps/QuipslyStudio/script/audio_workbench_listen_notes_repair_planner.py", *common]),
        ("post-review action queue", ["python3", "apps/QuipslyStudio/script/audio_workbench_post_review_action_queue.py", *common]),
        ("audio review status board", ["python3", "apps/QuipslyStudio/script/audio_workbench_review_status_board.py", *common]),
        ("audio review gate audit", ["python3", "apps/QuipslyStudio/script/audio_workbench_review_gate_audit.py", *common]),
        ("post-listen outcome router", ["python3", "apps/QuipslyStudio/script/audio_workbench_post_listen_outcome_router.py", *common]),
        ("human-listen decision rehearsal", ["python3", "apps/QuipslyStudio/script/audio_workbench_human_listen_decision_rehearsal.py", *common]),
        ("stable review start-here", ["python3", "apps/QuipslyStudio/script/audio_workbench_review_start_here.py", *common]),
    ]
    if goal_file and goal_file.exists():
        scripts.append(
            (
                "audio goal completion audit",
                [
                    "python3",
                    "apps/QuipslyStudio/script/audio_workbench_goal_completion_audit.py",
                    *common,
                    "--goal-file",
                    str(goal_file),
                ],
            )
        )
    scripts.append(("review handoff index", ["python3", "apps/QuipslyStudio/script/audio_workbench_review_handoff_index.py", *common]))

    for label, step_args in scripts:
        steps.append(run_step(label, step_args))

    after = read_json(manifest_path)
    outputs = after.setdefault("outputs", {})
    command_path = baseline_dir / "PROCESS_EPISODE_4_AUDIO_REVIEW_NOTES.command"
    output_json = baseline_dir / f"audio-post-human-listen-notes-roundtrip-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"audio-post-human-listen-notes-roundtrip-{slug}-{generated_at}.md"

    artifacts = [
        artifact(outputs, "Listen-priority/control-room notes inbox", "latestAudioListenPriorityNotesInboxMarkdown"),
        artifact(outputs, "Speaker-cleanup listen-map notes inbox", "latestSpeakerCleanupListenMapNotesInboxMarkdown"),
        artifact(outputs, "Speaker-preservation proof notes inbox", "latestAudioSpeakerPreservationProofNotesInboxMarkdown"),
        artifact(outputs, "Final listen fast-pass notes inbox", "latestAudioFinalListenFastPassNotesInboxMarkdown"),
        artifact(outputs, "Smoothness proof notes inbox", "latestAudioSmoothnessProofNotesInboxMarkdown"),
        artifact(outputs, "Parameter-sweep proof notes inbox", "latestAudioWorkbenchParameterSweepNotesInboxMarkdown"),
        artifact(outputs, "Producer-grade audio audit", "latestAudioProducerGradeAuditMarkdown"),
        artifact(outputs, "Producer-grade notes inbox", "latestAudioProducerGradeNotesInboxMarkdown"),
        artifact(outputs, "Marker-review notes inbox", "latestMarkerReviewNotesInboxMarkdown"),
        artifact(outputs, "Listen-notes repair planner", "latestAudioListenNotesRepairPlannerMarkdown"),
        artifact(outputs, "Post-review action queue", "latestAudioPostReviewActionQueueMarkdown"),
        artifact(outputs, "Audio review status board", "latestAudioReviewStatusBoardStableMarkdown"),
        artifact(outputs, "Audio review gate audit", "latestAudioReviewGateAuditMarkdown"),
        artifact(outputs, "Post-listen outcome router", "latestPostListenOutcomeRouterMarkdown"),
        artifact(outputs, "Human-listen decision rehearsal", "latestHumanListenDecisionRehearsal"),
        artifact(outputs, "Human-listen decision rehearsal Markdown", "latestHumanListenDecisionRehearsalMarkdown"),
        artifact(outputs, "Stable START_HERE", "latestAudioReviewStartHereMarkdown"),
        artifact(outputs, "Goal completion audit", "latestAudioGoalCompletionAuditMarkdown"),
        artifact(outputs, "Review handoff index", "latestReviewHandoffIndexMarkdown"),
    ]

    rerun = [
        "OUT=" + shell_quote(str(baseline_dir)),
        "python3 apps/QuipslyStudio/script/audio_workbench_post_human_listen_notes_roundtrip.py --baseline-dir \"$OUT\"",
    ]
    if goal_file:
        rerun[-1] += " --goal-file " + shell_quote(str(goal_file))

    report = {
        "schema": "quipsly.audio-workbench.post-human-listen-notes-roundtrip.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "goalFile": str(goal_file) if goal_file else None,
        "truthBefore": {
            "approvalStatus": before.get("approvalStatus"),
            "branchInheritanceReady": bool(before.get("branchInheritanceReady")),
            "branchRenderReady": bool(before.get("branchRenderReady")),
        },
        "truthAfter": {
            "approvalStatus": after.get("approvalStatus"),
            "branchInheritanceReady": bool(after.get("branchInheritanceReady")),
            "branchRenderReady": bool(after.get("branchRenderReady")),
        },
        "steps": steps,
        "allStepsOk": all(step["ok"] for step in steps),
        "artifacts": artifacts,
        "commands": {"rerun": rerun, "openStableReview": ["open " + shell_quote(str(baseline_dir / "START_HERE_EPISODE_4_AUDIO_REVIEW.md"))]},
        "markdown": str(output_md),
        "command": str(command_path),
        "approvalStateChanged": before.get("approvalStatus") != after.get("approvalStatus"),
        "branchStateChanged": bool(before.get("branchInheritanceReady")) != bool(after.get("branchInheritanceReady"))
        or bool(before.get("branchRenderReady")) != bool(after.get("branchRenderReady")),
        "renderAttempted": False,
        "originalMediaMutated": False,
    }

    write_json(output_json, report)
    output_md.write_text(build_markdown(report) + "\n", encoding="utf-8")
    command_path.write_text(build_open_command(baseline_dir=baseline_dir, goal_file=goal_file), encoding="utf-8")
    os.chmod(command_path, 0o755)

    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioPostHumanListenNotesRoundtrip"] = str(output_json)
    outputs["latestAudioPostHumanListenNotesRoundtripMarkdown"] = str(output_md)
    outputs["latestAudioPostHumanListenNotesRoundtripCommand"] = str(command_path)
    history = outputs.setdefault("audioPostHumanListenNotesRoundtrips", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["audioPostHumanListenNotesRoundtripCount"] = len(history)
    write_json(manifest_path, manifest)

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "allStepsOk": report["allStepsOk"],
                "markdown": str(output_md),
                "json": str(output_json),
                "command": str(command_path),
                "approvalStateChanged": report["approvalStateChanged"],
                "branchStateChanged": report["branchStateChanged"],
                "renderAttempted": False,
                "originalMediaMutated": False,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
