#!/usr/bin/env python3
"""Smoke-test the human-listen decision front door without approving audio.

This proves the decision front door is present, linked, and guarded:

- stable front-door artifacts exist;
- the front-door report has the expected commands;
- regenerating the front door does not change approval or branch truth;
- imported reviewer notes can dry-run through the guarded decision bridge;
- approval cannot be recorded without --confirm-human-listened;
- the real baseline remains pending human listen with branches locked.

It writes only review/control artifacts and manifest output pointers. It does
not approve audio, fail audio, unlock branch inheritance, render branches,
upload, publish, or mutate original media.
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


CORE_TRUTH_KEYS = [
    "approvalStatus",
    "packageReadyForHumanListen",
    "branchInheritanceReady",
    "branchRenderReady",
    "originalMediaMutated",
]

REQUIRED_FRONT_DOOR_OUTPUTS = [
    ("latestHumanListenDecisionFrontDoor", "front-door JSON"),
    ("latestHumanListenDecisionFrontDoorMarkdown", "front-door Markdown"),
    ("latestHumanListenDecisionFrontDoorHtml", "front-door HTML"),
    ("latestHumanListenDecisionFrontDoorOpenCommand", "front-door launcher"),
    ("latestHumanListenDecisionRecordCommand", "guarded decision recorder"),
]

REQUIRED_COMMANDS = [
    "codexDryRunPlainDecision",
    "codexRecordPlainApproveAfterListen",
    "codexRecordPlainNeedsProofAfterListen",
    "codexRecordPlainFailAfterListen",
    "dryRunImportedNotes",
    "recordImportedNotesAfterListen",
    "directApproveBranchInheritance",
    "directNeedsFocusedProof",
    "directFailForRepair",
    "afterDecisionRefresh",
]


def int_value(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


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
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in ("path", "markdownPath", "htmlPath", "openCommand"):
            path = value.get(key)
            if isinstance(path, str) and path:
                return path
    return None


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def truth_snapshot(manifest: dict[str, Any]) -> dict[str, Any]:
    return {key: manifest.get(key) for key in CORE_TRUTH_KEYS}


def run_command(command: list[str]) -> dict[str, Any]:
    proc = subprocess.run(
        command,
        cwd=repo_root(),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return {
        "command": command,
        "returncode": proc.returncode,
        "stdout": proc.stdout[-4000:],
        "stderr": proc.stderr[-4000:],
    }


def add_check(checks: list[dict[str, Any]], name: str, passed: bool, detail: str, **extra: Any) -> None:
    checks.append(
        {
            "name": name,
            "passed": bool(passed),
            "detail": detail,
            **extra,
        }
    )


def synthetic_approval_notes_packet(manifest: dict[str, Any], path: Path) -> None:
    packet = {
        "schema": "quipsly.audio-workbench.reviewer-notes-packet.v1",
        "mode": "imported-notes",
        "baselineId": manifest.get("baselineId"),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "reviewer": "decision-front-door-smoke",
        "suggestedDecisionStatus": "human-approved-for-branch-inheritance",
        "wholeEpisodeNotes": (
            "Synthetic smoke packet. This proves the guarded decision bridge can dry-run "
            "without approving the real baseline."
        ),
        "windows": [
            {
                "label": "synthetic-all-pass-window",
                "decision": "pass",
                "notes": "Smoke-only pass marker.",
            }
        ],
    }
    write_json(path, packet)


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Human Listen Decision Front-Door Smoke: {report['baselineId']}",
        "",
        f"- Generated: `{report['generatedAt']}`",
        f"- Status: `{report['status']}`",
        f"- Passed: `{str(report['passed']).lower()}`",
        f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
        f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
        f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "This smoke test proves the human-listen decision front door is linked and guarded. It does not record a real human listen decision.",
        "",
        "## Core truth after smoke",
        "",
    ]
    for key, value in report["afterTruth"].items():
        lines.append(f"- `{key}`: `{value}`")
    lines.extend(["", "## Checks", "", "| Check | Passed | Detail |", "|---|---:|---|"])
    for check in report["checks"]:
        lines.append(
            f"| {check['name']} | `{str(check['passed']).lower()}` | {check['detail']} |"
        )
    lines.extend(
        [
            "",
            "## Guardrail",
            "",
            "A passing smoke means the route is wired and safe. It is not human approval. Branch inheritance and branch rendering stay locked until a real human listen decision is recorded with `--confirm-human-listened`.",
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
    before_manifest = read_json(manifest_path)
    before_truth = truth_snapshot(before_manifest)
    outputs = before_manifest.get("outputs") or {}
    baseline_id = str(before_manifest.get("baselineId") or "unknown-baseline")
    slug = safe_slug(baseline_id)
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    checks: list[dict[str, Any]] = []

    required_paths: dict[str, str | None] = {}
    for key, label in REQUIRED_FRONT_DOOR_OUTPUTS:
        path_text = output_path(outputs.get(key))
        required_paths[key] = path_text
        add_check(
            checks,
            f"{label} exists",
            bool(path_text and Path(path_text).exists()),
            path_text or "not registered",
            key=key,
        )

    record_command_path = required_paths.get("latestHumanListenDecisionRecordCommand")
    record_command_text = ""
    if record_command_path and Path(record_command_path).exists():
        record_command_text = Path(record_command_path).read_text(encoding="utf-8")
    add_check(
        checks,
        "decision recorder has fast-readback preflight",
        "audio_workbench_fast_readback_check.py" in record_command_text
        and "Fast readback OK" in record_command_text
        and "Refusing to record a human decision" in record_command_text,
        record_command_path or "not registered",
    )
    add_check(
        checks,
        "decision recorder requires source-aware branch executor",
        "postApprovalApprovedSandboxExecutorSourceAwareRenderContractReady" in record_command_text
        and "postApprovalApprovedSandboxExecutorInheritsSourceAwareAudioTruth" in record_command_text
        and "postApprovalApprovedSandboxExecutorSourceAwareAudioRoleIds" in record_command_text
        and "postApprovalApprovedSandboxExecutorMasteredSpineOnlyEditingAllowed" in record_command_text
        and "mastered-spine-only branch path is not allowed" in record_command_text,
        record_command_path or "not registered",
    )
    add_check(
        checks,
        "decision recorder requires post-listen refined-stem branch plan",
        "postListenRefreshBranchPreflightBranchAudioPlanStatus" in record_command_text
        and "postListenRefreshBranchExecutorBranchAudioPlanStatus" in record_command_text
        and "postListenRefreshBranchExecutorSourceAwareBranchRenderWillUseRefinedStems" in record_command_text
        and "postListenRefreshBranchExecutorSourceAwareBranchRenderStemPathsProved" in record_command_text
        and "post-listen refined-stem branch plan ready" in record_command_text,
        record_command_path or "not registered",
    )

    front_door_report: dict[str, Any] = {}
    front_door_path = required_paths.get("latestHumanListenDecisionFrontDoor")
    if front_door_path and Path(front_door_path).exists():
        front_door_report = read_json(Path(front_door_path))
    add_check(
        checks,
        "front-door report ready",
        front_door_report.get("status") == "ready-for-human-listen-decision"
        and int(front_door_report.get("missingRequiredArtifactCount") or 0) == 0,
        (
            f"status={front_door_report.get('status')} "
            f"missing={front_door_report.get('missingRequiredArtifactCount')}"
        ),
    )
    commands = front_door_report.get("commands") if isinstance(front_door_report, dict) else {}
    for command_key in REQUIRED_COMMANDS:
        add_check(
            checks,
            f"command registered: {command_key}",
            isinstance(commands, dict) and bool(commands.get(command_key)),
            "present" if isinstance(commands, dict) and commands.get(command_key) else "missing",
        )
    required_labels = {item.get("label") for item in front_door_report.get("requiredArtifacts") or [] if isinstance(item, dict)}
    for label in [
        "Sound Director Scorecard",
        "Audio Defect Atlas",
        "Audio Defect Atlas Notes Template",
        "Audio Defect Atlas Notes Inbox",
        "Audio Defect Atlas Notes Inbox Smoke",
        "Human Listen Mission Board",
        "Human Listen Mission Reel",
        "Source-Balance Triage",
        "Speaker Cleanup Acceptance Board",
        "Speaker Cleanup Listen Reel",
        "Mission Reel Notes Inbox",
        "Scoped v007 Repair Candidate Plan",
        "Scoped v007 Repair Candidate Plan Smoke",
    ]:
        add_check(
            checks,
            f"current runway artifact listed: {label}",
            label in required_labels,
            "listed" if label in required_labels else f"missing from {sorted(required_labels)}",
        )
    runway = front_door_report.get("reviewRunway") if isinstance(front_door_report.get("reviewRunway"), dict) else {}
    runway_expectations = [
        ("mission focus windows present", int_value(runway.get("missionFocusWindowCount")) > 0, f"missionFocusWindowCount={runway.get('missionFocusWindowCount')}"),
        ("mission reel items present", int_value(runway.get("missionReelItemCount")) > 0, f"missionReelItemCount={runway.get('missionReelItemCount')}"),
        ("source-balance triage windows present", int_value(runway.get("sourceBalanceTriageWindowCount")) > 0, f"sourceBalanceTriageWindowCount={runway.get('sourceBalanceTriageWindowCount')}"),
        ("defect atlas items present", int_value(runway.get("defectAtlasItemCount")) > 0, f"defectAtlasItemCount={runway.get('defectAtlasItemCount')}"),
        ("defect atlas has zero missing evidence", int_value(runway.get("defectAtlasMissingEvidenceCount")) == 0, f"defectAtlasMissingEvidenceCount={runway.get('defectAtlasMissingEvidenceCount')}"),
        ("defect atlas notes inbox status present", bool(runway.get("defectAtlasNotesInboxStatus")), f"defectAtlasNotesInboxStatus={runway.get('defectAtlasNotesInboxStatus')}"),
        ("defect atlas notes inbox smoke passed", bool(runway.get("defectAtlasNotesInboxSmokePassed")), f"defectAtlasNotesInboxSmokePassed={runway.get('defectAtlasNotesInboxSmokePassed')}"),
        ("speaker cleanup must-listen windows present", int_value(runway.get("speakerCleanupMustListenCount")) > 0, f"speakerCleanupMustListenCount={runway.get('speakerCleanupMustListenCount')}"),
        ("speaker cleanup listen reel items present", int_value(runway.get("speakerCleanupListenReelItemCount")) > 0, f"speakerCleanupListenReelItemCount={runway.get('speakerCleanupListenReelItemCount')}"),
        ("speaker cleanup listen reel has zero missing snippets", int_value(runway.get("speakerCleanupListenReelMissingSnippetCount")) == 0, f"speakerCleanupListenReelMissingSnippetCount={runway.get('speakerCleanupListenReelMissingSnippetCount')}"),
        ("speaker cleanup listen reel has duration", float(runway.get("speakerCleanupListenReelDurationSeconds") or 0) > 0, f"speakerCleanupListenReelDurationSeconds={runway.get('speakerCleanupListenReelDurationSeconds')}"),
        ("registered speakers survive in master", bool(runway.get("allSpeakersSurviveInMaster")), f"allSpeakersSurviveInMaster={runway.get('allSpeakersSurviveInMaster')}"),
        ("post-review queue is ready", runway.get("postReviewQueueStatus") == "ready-for-review-actions", f"postReviewQueueStatus={runway.get('postReviewQueueStatus')}"),
        ("scoped v007 plan status present", runway.get("scopedV007PlanStatus") in {"waiting-for-human-review-actions", "ready-for-scoped-v007-repair-candidates"}, f"scopedV007PlanStatus={runway.get('scopedV007PlanStatus')}"),
        ("scoped v007 plan queue is ready", runway.get("scopedV007PlanQueueStatus") == "ready-for-review-actions", f"scopedV007PlanQueueStatus={runway.get('scopedV007PlanQueueStatus')}"),
        ("scoped v007 planner smoke passed", bool(runway.get("scopedV007PlanSmokePassed")), f"scopedV007PlanSmokePassed={runway.get('scopedV007PlanSmokePassed')}"),
        ("scoped v007 planner smoke has scenarios", int_value(runway.get("scopedV007PlanSmokeScenarioCount")) > 0, f"scopedV007PlanSmokeScenarioCount={runway.get('scopedV007PlanSmokeScenarioCount')}"),
        ("scoped v007 planner smoke has zero failures", int_value(runway.get("scopedV007PlanSmokeFailureCount")) == 0, f"scopedV007PlanSmokeFailureCount={runway.get('scopedV007PlanSmokeFailureCount')}"),
    ]
    for name, passed_check, detail in runway_expectations:
        add_check(checks, name, passed_check, detail)

    regenerate_result = run_command(
        [
            "python3",
            "apps/QuipslyStudio/script/audio_workbench_human_listen_decision_front_door.py",
            "--baseline-dir",
            str(baseline_dir),
        ]
    )
    add_check(
        checks,
        "front-door generator reruns",
        regenerate_result["returncode"] == 0,
        f"returncode={regenerate_result['returncode']}",
        result=regenerate_result,
    )
    after_regenerate_manifest = read_json(manifest_path)
    after_regenerate_truth = truth_snapshot(after_regenerate_manifest)
    add_check(
        checks,
        "regeneration preserves approval and branch truth",
        after_regenerate_truth == before_truth,
        f"before={before_truth} after={after_regenerate_truth}",
    )

    with tempfile.TemporaryDirectory(prefix="quipsly-decision-front-door-smoke-") as temp_root:
        temp_baseline = Path(temp_root) / "baseline"
        temp_baseline.mkdir(parents=True)
        shutil.copy2(manifest_path, temp_baseline / "manifest.json")
        notes_path = temp_baseline / "synthetic-approval-notes.json"
        synthetic_approval_notes_packet(after_regenerate_manifest, notes_path)

        dry_run_result = run_command(
            [
                "python3",
                "apps/QuipslyStudio/script/audio_workbench_record_listen_decision_from_notes.py",
                "--baseline-dir",
                str(temp_baseline),
                "--notes-packet",
                str(notes_path),
                "--reviewer",
                "decision-front-door-smoke",
                "--confirm-human-listened",
                "--dry-run",
            ]
        )
        add_check(
            checks,
            "synthetic approval notes dry-run through guarded bridge",
            dry_run_result["returncode"] == 0,
            f"returncode={dry_run_result['returncode']}",
            result=dry_run_result,
        )

        no_confirm_result = run_command(
            [
                "python3",
                "apps/QuipslyStudio/script/audio_workbench_record_listen_decision_from_notes.py",
                "--baseline-dir",
                str(temp_baseline),
                "--notes-packet",
                str(notes_path),
                "--reviewer",
                "decision-front-door-smoke",
            ]
        )
        no_confirm_text = f"{no_confirm_result['stdout']}\n{no_confirm_result['stderr']}"
        add_check(
            checks,
            "approval without human-listen confirmation is rejected",
            no_confirm_result["returncode"] != 0 and "Approval requires --confirm-human-listened" in no_confirm_text,
            f"returncode={no_confirm_result['returncode']}",
            result=no_confirm_result,
        )

        original_fast_readback_path = output_path(
            (after_regenerate_manifest.get("outputs") or {}).get("latestAudioFastReadbackCheck")
        )
        if original_fast_readback_path and Path(original_fast_readback_path).exists():
            stale_report_path = temp_baseline / "AUDIO_FAST_READBACK_CHECK.json"
            stale_report = read_json(Path(original_fast_readback_path))
            stale_report["postListenRefreshBranchExecutorBranchAudioPlanStatus"] = "stale-mastered-spine-plan"
            write_json(stale_report_path, stale_report)
            stale_manifest = read_json(temp_baseline / "manifest.json")
            stale_outputs = stale_manifest.setdefault("outputs", {})
            stale_outputs["latestAudioFastReadbackCheck"] = {
                "path": str(stale_report_path),
                "jsonPath": str(stale_report_path),
            }
            write_json(temp_baseline / "manifest.json", stale_manifest)
            stale_approval_result = run_command(
                [
                    "python3",
                    "apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py",
                    "--baseline-dir",
                    str(temp_baseline),
                    "--status",
                    "human-approved-for-branch-inheritance",
                    "--reviewer",
                    "decision-front-door-smoke",
                    "--notes",
                    "Synthetic stale-branch-plan smoke. This must not approve.",
                    "--confirm-human-listened",
                    "--dry-run",
                ]
            )
            stale_approval_text = f"{stale_approval_result['stdout']}\n{stale_approval_result['stderr']}"
            add_check(
                checks,
                "approval dry-run rejects stale post-listen refined-stem branch plan",
                stale_approval_result["returncode"] != 0
                and "post-listen refresh branch executor plan" in stale_approval_text,
                f"returncode={stale_approval_result['returncode']}",
                result=stale_approval_result,
            )
        else:
            add_check(
                checks,
                "approval dry-run rejects stale post-listen refined-stem branch plan",
                False,
                original_fast_readback_path or "latestAudioFastReadbackCheck not registered",
            )

    after_manifest = read_json(manifest_path)
    after_truth = truth_snapshot(after_manifest)
    approval_state_changed = after_truth.get("approvalStatus") != before_truth.get("approvalStatus")
    branch_state_changed = (
        after_truth.get("branchInheritanceReady") != before_truth.get("branchInheritanceReady")
        or after_truth.get("branchRenderReady") != before_truth.get("branchRenderReady")
    )
    original_media_mutated = bool(after_truth.get("originalMediaMutated"))
    add_check(
        checks,
        "real baseline truth remains locked",
        after_truth == before_truth,
        f"before={before_truth} after={after_truth}",
    )

    failure_count = sum(1 for check in checks if not check["passed"])
    passed = failure_count == 0
    report = {
        "schema": "quipsly.audio-workbench.human-listen-decision-front-door-smoke.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "status": "passed" if passed else "failed",
        "passed": passed,
        "failureCount": failure_count,
        "checkCount": len(checks),
        "checks": checks,
        "requiredPaths": required_paths,
        "beforeTruth": before_truth,
        "afterTruth": after_truth,
        "approvalStateChanged": approval_state_changed,
        "branchStateChanged": branch_state_changed,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": original_media_mutated,
    }

    json_path = baseline_dir / f"human-listen-decision-front-door-smoke-{slug}-{generated_at}.json"
    md_path = baseline_dir / f"human-listen-decision-front-door-smoke-{slug}-{generated_at}.md"
    write_json(json_path, report)
    md_path.write_text(render_markdown(report), encoding="utf-8")

    final_manifest = read_json(manifest_path)
    outputs = final_manifest.setdefault("outputs", {})
    outputs["latestHumanListenDecisionFrontDoorSmoke"] = str(json_path)
    outputs["latestHumanListenDecisionFrontDoorSmokeMarkdown"] = str(md_path)
    history = outputs.setdefault("humanListenDecisionFrontDoorSmokes", [])
    if str(json_path) not in history:
        history.append(str(json_path))
    final_manifest["humanListenDecisionFrontDoorSmokeStatus"] = report["status"]
    final_manifest["humanListenDecisionFrontDoorSmokePassed"] = passed
    final_manifest["humanListenDecisionFrontDoorSmokeCount"] = len(history)
    write_json(manifest_path, final_manifest)

    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
