#!/usr/bin/env python3
"""Guarded executor for Episode 4 branch renders from an approved audio baseline.

This script exists to prevent the obvious future foot-gun:
"The audio candidate has proof media, so surely we can render the real episode."

Nope. It only exposes or runs real branch renders when the baseline manifest says
human listen approval and branch inheritance are ready. Before that, it writes a
blocked report and does not call the renderer.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APPROVED_STATUSES = {
    "human-approved-for-branch-inheritance",
    "human-approved-for-publication",
}

BRANCHES = ("tight-30-45", "main-45-60", "extended-60-80")
REQUIRED_SOURCE_AWARE_STEM_ROLES = {"charlie", "homer", "clip-source"}


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def build_command(
    root: Path,
    *,
    baseline_dir: Path,
    branch: str,
    run_label: str,
    output_root: str | None,
    dry_run: bool,
) -> list[str]:
    command = [
        "python3",
        str(root / "apps" / "QuipslyStudio" / "script" / "episode4_full_sync_export.py"),
        "--branch",
        branch,
        "--run-label",
        run_label,
        "--conformed-baseline-dir",
        str(baseline_dir),
    ]
    if output_root:
        command.extend(["--output-root", output_root])
    if dry_run:
        command.append("--dry-run")
    return command


def run_command(command: list[str], cwd: Path) -> dict[str, Any]:
    result = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
    parsed: Any = None
    if result.stdout.strip():
        try:
            parsed = json.loads(result.stdout)
        except json.JSONDecodeError:
            parsed = None
    return {
        "command": command,
        "returncode": result.returncode,
        "stdout": result.stdout.strip(),
        "stderr": result.stderr.strip(),
        "parsedStdout": parsed,
        "ok": result.returncode == 0,
    }


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in ("path", "jsonPath", "versionedJsonPath"):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def load_output_report(outputs: dict[str, Any], key: str) -> tuple[dict[str, Any], str | None]:
    path_text = output_path(outputs.get(key))
    if not path_text:
        return {}, None
    path = Path(path_text)
    if not path.exists() or path.suffix.lower() != ".json":
        return {}, path_text
    try:
        return load_json(path), path_text
    except json.JSONDecodeError:
        return {}, path_text


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def source_aware_render_contract(manifest: dict[str, Any]) -> dict[str, Any]:
    role_ids = [
        str(role)
        for role in (manifest.get("audioPostApprovalRenderRehearsalSourceAwareAudioRoleIds") or [])
    ]
    role_set = set(role_ids)
    missing_roles = sorted(REQUIRED_SOURCE_AWARE_STEM_ROLES - role_set)
    ready_stem_count = int(manifest.get("audioPostApprovalRenderRehearsalSourceAwareAudioReadyStemCount") or 0)
    status = str(manifest.get("audioPostApprovalRenderRehearsalSourceAwareAudioContractStatus") or "")
    inherits_truth = bool(manifest.get("audioPostApprovalRenderRehearsalInheritsSourceAwareAudioTruth"))
    mastered_spine_only_allowed = bool(
        manifest.get("audioPostApprovalRenderRehearsalMasteredSpineOnlyEditingAllowed", True)
    )
    ready = (
        inherits_truth
        and status == "ready-source-aware-editable"
        and not missing_roles
        and ready_stem_count >= len(REQUIRED_SOURCE_AWARE_STEM_ROLES)
        and not mastered_spine_only_allowed
    )
    return {
        "ready": ready,
        "inheritsSourceAwareAudioTruth": inherits_truth,
        "status": status,
        "roleIds": role_ids,
        "missingRoleIds": missing_roles,
        "readyStemCount": ready_stem_count,
        "masteredSpineOnlyEditingAllowed": mastered_spine_only_allowed,
    }


def branch_audio_plan_contract(outputs: dict[str, Any]) -> dict[str, Any]:
    report, report_path = load_output_report(outputs, "latestAudioPostApprovalRenderRehearsal")
    plan = report.get("branchAudioPlan") if isinstance(report.get("branchAudioPlan"), dict) else {}
    stems = plan.get("selectedRefinedStems") if isinstance(plan.get("selectedRefinedStems"), list) else []
    selected_stems = [stem for stem in stems if isinstance(stem, dict)]
    role_ids = {str(stem.get("roleId")) for stem in selected_stems if stem.get("roleId")}
    missing_roles = sorted(REQUIRED_SOURCE_AWARE_STEM_ROLES - role_ids)
    missing_paths: list[str] = []
    for stem in selected_stems:
        role_id = str(stem.get("roleId") or "unknown")
        path_text = stem.get("path")
        if not path_text or not Path(str(path_text)).exists():
            missing_paths.append(f"{role_id}: {path_text}")
    truth = plan.get("branchAudioTruth") or report.get("branchAudioTruth")
    will_use_stems = bool(
        plan.get("branchAudioWillUseSourceAwareStemsAfterApproval")
        or report.get("branchAudioWillUseSourceAwareStemsAfterApproval")
    )
    mastered_only_render = bool(
        plan.get("branchAudioRenderedFromMasteredSpineOnly")
        or report.get("branchAudioRenderedFromMasteredSpineOnly")
    )
    mastered_only_editing = bool(
        plan.get("masteredSpineOnlyEditingAllowed")
        or report.get("branchMasteredSpineOnlyEditingAllowed")
    )
    ready = (
        bool(report)
        and truth == "source-aware-refined-stems"
        and will_use_stems
        and not mastered_only_render
        and not mastered_only_editing
        and not missing_roles
        and not missing_paths
        and len(selected_stems) >= len(REQUIRED_SOURCE_AWARE_STEM_ROLES)
    )
    return {
        "ready": ready,
        "status": "ready-source-aware-refined-stem-plan" if ready else "blocked-source-aware-refined-stem-plan",
        "reportPath": report_path,
        "branchAudioTruth": truth,
        "willUseSourceAwareStemsAfterApproval": will_use_stems,
        "branchAudioRenderedFromMasteredSpineOnly": mastered_only_render,
        "masteredSpineOnlyEditingAllowed": mastered_only_editing,
        "selectedRefinedStemCount": len(selected_stems),
        "selectedRefinedStems": selected_stems,
        "missingRoleIds": missing_roles,
        "missingStemPathCount": len(missing_paths),
        "missingStemPaths": missing_paths,
        "expectedMixOutputName": "episode4-source-aware-branch-audio.wav",
    }


def write_open_command(path: Path, target: Path) -> None:
    path.write_text(f"#!/bin/zsh\nopen {shell_quote(str(target))}\n", encoding="utf-8")
    path.chmod(0o755)


def write_render_command(path: Path, *, baseline_dir: Path, default_output_root: str | None) -> None:
    root = repo_root()
    output_root = default_output_root or "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Full_Sync_Edits"
    path.write_text(
        "\n".join(
            [
                "#!/bin/zsh",
                "set -eu",
                "REPO=" + shell_quote(str(root)),
                "BASE=" + shell_quote(str(baseline_dir)),
                "OUT_ROOT=${QUIPSLY_EPISODE4_OUTPUT_ROOT:-" + shell_quote(output_root) + "}",
                "cd \"$REPO\"",
                "printf '\\nEpisode 4 post-approval branch renderer\\n'",
                "printf 'This renders local candidate files only after the audio-spine approval gates pass.\\n'",
                "printf 'It does not upload, publish, schedule, or mutate original media.\\n\\n'",
                "printf 'Baseline:\\n  %s\\n\\n' \"$BASE\"",
                "printf 'Output root:\\n  %s\\n\\n' \"$OUT_ROOT\"",
                "printf 'Refreshing dry-run executor plan first...\\n'",
                "python3 apps/QuipslyStudio/script/audio_workbench_approved_branch_render_executor.py --baseline-dir \"$BASE\" --output-root \"$OUT_ROOT\" --run-label \"post-approval-dry-run-$(date -u +%Y%m%d-%H%M%S)\"",
                "printf '\\nIf the report says blocked-waiting-for-human-listen, stop here and record/refresh the audio approval first.\\n'",
                "printf 'Type exactly RENDER EPISODE 4 to render all approved branch candidates: '",
                "IFS= read -r CONFIRMATION",
                "if [ \"$CONFIRMATION\" != 'RENDER EPISODE 4' ]; then printf 'No render attempted.\\n'; exit 2; fi",
                "printf '\\nRendering Episode 4 branch candidates...\\n'",
                "python3 apps/QuipslyStudio/script/audio_workbench_approved_branch_render_executor.py --baseline-dir \"$BASE\" --output-root \"$OUT_ROOT\" --run-label \"approved-episode4-$(date -u +%Y%m%d-%H%M%S)\" --execute",
                "printf '\\nRender command finished. Inspect the executor report and generated manifests before any platform upload.\\n'",
                "",
            ]
        ),
        encoding="utf-8",
    )
    path.chmod(0o755)


def build_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Approved Branch Render Executor: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This is the guarded path for real Episode 4 branch renders inheriting the conformed audio spine.",
        "",
        "## Verdict",
        "",
        f"- Status: `{report['status']}`",
        f"- Execute requested: `{str(report['executeRequested']).lower()}`",
        f"- Can execute real renders: `{str(report['canExecuteRealRenders']).lower()}`",
        f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
        f"- Upload attempted: `{str(report['uploadAttempted']).lower()}`",
        f"- Publication attempted: `{str(report['publicationAttempted']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Source-aware audio contract ready: `{str(report['sourceAwareRenderContractReady']).lower()}`",
        f"- Source-aware audio contract: `{report['sourceAwareAudioContractStatus']}`",
        f"- Source-aware roles: `{', '.join(report['sourceAwareAudioRoleIds'])}`",
        f"- Branch audio plan status: `{report['branchAudioPlanStatus']}`",
        f"- Branch audio plan stem count: `{report['branchAudioPlanSelectedRefinedStemCount']}`",
        f"- Branch audio plan missing roles: `{', '.join(report['branchAudioPlanMissingRoleIds']) or 'none'}`",
        f"- Branch audio plan missing stem paths: `{report['branchAudioPlanMissingStemPathCount']}`",
        f"- Source-aware branch stem paths proved: `{str(report['sourceAwareBranchRenderStemPathsProved']).lower()}`",
        f"- Source-aware branch mix output: `{report['sourceAwareBranchRenderExpectedMixOutputName']}`",
        f"- Branch render audio truth: `{report['branchRenderAudioTruth']}`",
        f"- Branch render will use source-aware refined stems: `{str(report['sourceAwareBranchRenderWillUseRefinedStems']).lower()}`",
        f"- Mastered-spine-only editing allowed: `{str(report['masteredSpineOnlyEditingAllowed']).lower()}`",
        f"- Mastered-spine-only branch rendering prevented: `{str(report['masteredSpineOnlyBranchRenderPrevented']).lower()}`",
        f"- Mastered spine use: `{report['masteredSpineUse']}`",
        f"- Stable render command: `{report['renderCommand']}`",
        "",
    ]
    if report["blockers"]:
        lines.extend(["## Blockers", ""])
        lines.extend(f"- {blocker}" for blocker in report["blockers"])
        lines.append("")
    lines.extend(["## Branch commands", ""])
    if not report["commandsExposed"]:
        lines.append("Real render commands are hidden until approval and branch inheritance gates pass.")
        lines.append("")
    else:
        for item in report["branches"]:
            lines.extend(
                [
                    f"### {item['branch']}",
                    "",
                    "```bash",
                    " ".join(item["command"]),
                    "```",
                    "",
                ]
            )
    if report["results"]:
        lines.extend(["## Results", ""])
        for result in report["results"]:
            lines.extend(
                [
                    f"### {result['branch']}",
                    "",
                    f"- OK: `{str(result['ok']).lower()}`",
                    f"- Return code: `{result['returncode']}`",
                    "",
                ]
            )
    lines.extend([
        "## Stable guarded render command",
        "",
        "After v006 audio is approved and branch gates are refreshed, run this stable command to dry-run the executor, require the `RENDER EPISODE 4` confirmation phrase, and render the configured branch candidates. Before approval, it remains safe because the executor refuses real renders.",
        "",
        f"- `{report['renderCommand']}`",
        "",
    ])
    lines.extend(["## Next safest action", "", report["nextSafestAction"], ""])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--branch", action="append", choices=BRANCHES)
    parser.add_argument("--output-root")
    parser.add_argument("--run-label")
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()

    baseline_dir = args.baseline_dir.expanduser().resolve()
    manifest_path = baseline_dir / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit(f"Missing manifest: {manifest_path}")

    manifest = load_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    root = repo_root()
    exporter = root / "apps" / "QuipslyStudio" / "script" / "episode4_full_sync_export.py"
    if not exporter.exists():
        raise SystemExit(f"Missing renderer: {exporter}")

    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    approval_status = str(manifest.get("approvalStatus") or "")
    branch_inheritance_ready = bool(manifest.get("branchInheritanceReady"))
    branch_render_ready = bool(manifest.get("branchRenderReady"))
    source_aware_contract = source_aware_render_contract(manifest)
    branch_audio_plan = branch_audio_plan_contract(outputs)

    branches = args.branch or list(BRANCHES)
    run_label = args.run_label or f"approved-conformed-audio-spine-{generated_at}"

    blockers: list[str] = []
    if approval_status not in APPROVED_STATUSES:
        blockers.append(f"approvalStatus is not human-approved: {approval_status}")
    if not branch_inheritance_ready:
        blockers.append("branchInheritanceReady is not true")
    if branch_render_ready is False:
        blockers.append("branchRenderReady is not true")
    if not source_aware_contract["inheritsSourceAwareAudioTruth"]:
        blockers.append("post-approval branch path does not inherit source-aware audio truth")
    if source_aware_contract["status"] != "ready-source-aware-editable":
        blockers.append(
            "source-aware audio contract is not ready-source-aware-editable: "
            f"{source_aware_contract['status'] or 'missing'}"
        )
    if source_aware_contract["missingRoleIds"]:
        blockers.append(
            "source-aware audio contract is missing required stem roles: "
            + ", ".join(source_aware_contract["missingRoleIds"])
        )
    if source_aware_contract["readyStemCount"] < len(REQUIRED_SOURCE_AWARE_STEM_ROLES):
        blockers.append(
            "source-aware audio contract has too few ready stems: "
            f"{source_aware_contract['readyStemCount']}"
        )
    if source_aware_contract["masteredSpineOnlyEditingAllowed"]:
        blockers.append("mastered-spine-only branch rendering is not allowed")
    if not branch_audio_plan["ready"]:
        blockers.append(f"branch audio plan is not ready: {branch_audio_plan['status']}")
    if branch_audio_plan["branchAudioTruth"] != "source-aware-refined-stems":
        blockers.append(f"branch audio plan truth is not source-aware-refined-stems: {branch_audio_plan['branchAudioTruth']}")
    if not branch_audio_plan["willUseSourceAwareStemsAfterApproval"]:
        blockers.append("branch audio plan does not promise source-aware stems after approval")
    if branch_audio_plan["branchAudioRenderedFromMasteredSpineOnly"]:
        blockers.append("branch audio plan would render from the mastered spine only")
    if branch_audio_plan["masteredSpineOnlyEditingAllowed"]:
        blockers.append("branch audio plan allows mastered-spine-only editing")
    if branch_audio_plan["missingRoleIds"]:
        blockers.append("branch audio plan missing required stem roles: " + ", ".join(branch_audio_plan["missingRoleIds"]))
    if branch_audio_plan["missingStemPaths"]:
        blockers.append("branch audio plan has missing stem paths: " + "; ".join(branch_audio_plan["missingStemPaths"]))

    can_execute = not blockers
    command_items: list[dict[str, Any]] = []
    results: list[dict[str, Any]] = []

    if can_execute:
        for branch in branches:
            command = build_command(
                root,
                baseline_dir=baseline_dir,
                branch=branch,
                run_label=run_label,
                output_root=args.output_root,
                dry_run=not args.execute,
            )
            command_items.append({"branch": branch, "command": command})
            if args.execute:
                result = run_command(command, root)
                results.append({"branch": branch, **result})

    if not can_execute:
        status = "blocked-waiting-for-human-listen"
        next_action = "Complete human listen proof, record approval, refresh the branch gate and branch-render preflight, then regenerate this executor plan."
    elif args.execute and all(result["ok"] for result in results):
        status = "executed"
        next_action = "Run branch QC on each rendered output before publication use."
    elif args.execute:
        status = "execution-failed"
        next_action = "Inspect failed renderer output and repair before publication use."
    else:
        status = "ready-dry-run"
        next_action = "Run again with --execute only if these commands match the intended branch render set."

    report = {
        "schema": "quipsly.audio-workbench.approved-branch-render-executor.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": approval_status,
        "branchInheritanceReady": branch_inheritance_ready,
        "branchRenderReady": branch_render_ready,
        "sourceAwareRenderContractReady": bool(source_aware_contract["ready"]),
        "inheritsSourceAwareAudioTruth": bool(source_aware_contract["inheritsSourceAwareAudioTruth"]),
        "sourceAwareAudioContractStatus": source_aware_contract["status"],
        "sourceAwareAudioRoleIds": source_aware_contract["roleIds"],
        "sourceAwareAudioMissingRoleIds": source_aware_contract["missingRoleIds"],
        "sourceAwareAudioReadyStemCount": source_aware_contract["readyStemCount"],
        "masteredSpineOnlyEditingAllowed": bool(source_aware_contract["masteredSpineOnlyEditingAllowed"]),
        "branchAudioPlanStatus": branch_audio_plan["status"],
        "branchAudioPlanReportPath": branch_audio_plan["reportPath"],
        "branchAudioPlanSelectedRefinedStemCount": branch_audio_plan["selectedRefinedStemCount"],
        "branchAudioPlanSelectedRefinedStems": branch_audio_plan["selectedRefinedStems"],
        "branchAudioPlanMissingRoleIds": branch_audio_plan["missingRoleIds"],
        "branchAudioPlanMissingStemPathCount": branch_audio_plan["missingStemPathCount"],
        "branchAudioPlanMissingStemPaths": branch_audio_plan["missingStemPaths"],
        "branchRenderAudioTruth": "source-aware-refined-stems",
        "sourceAwareBranchRenderWillUseRefinedStems": bool(source_aware_contract["ready"] and branch_audio_plan["ready"]),
        "sourceAwareBranchRenderStemPathsProved": bool(branch_audio_plan["ready"]),
        "sourceAwareBranchRenderExpectedMixOutputName": branch_audio_plan["expectedMixOutputName"],
        "masteredSpineOnlyBranchRenderPrevented": not bool(source_aware_contract["masteredSpineOnlyEditingAllowed"]) and not bool(branch_audio_plan["branchAudioRenderedFromMasteredSpineOnly"]),
        "masteredSpineUse": "review-export-premiere-final-podcast-convenience-not-editable-branch-truth",
        "executeRequested": bool(args.execute),
        "canExecuteRealRenders": can_execute,
        "commandsExposed": can_execute,
        "status": status,
        "runLabel": run_label,
        "branches": command_items,
        "results": results,
        "blockerCount": len(blockers),
        "resultCount": len(results),
        "blockers": blockers,
        "renderCommand": str(baseline_dir / "RENDER_EPISODE_4_AFTER_AUDIO_APPROVAL.command"),
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": bool(args.execute and can_execute),
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
        "nextSafestAction": next_action,
    }

    output_json = baseline_dir / f"audio-approved-branch-render-executor-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"audio-approved-branch-render-executor-{slug}-{generated_at}.md"
    output_open = baseline_dir / "OPEN_APPROVED_BRANCH_RENDER_EXECUTOR.command"
    output_render = baseline_dir / "RENDER_EPISODE_4_AFTER_AUDIO_APPROVAL.command"
    output_json.write_text(json.dumps(report, indent=2) + "\n")
    output_md.write_text(build_markdown(report) + "\n")
    write_open_command(output_open, output_md)
    write_render_command(output_render, baseline_dir=baseline_dir, default_output_root=args.output_root)

    outputs["latestApprovedBranchRenderExecutor"] = str(output_json)
    outputs["latestApprovedBranchRenderExecutorMarkdown"] = str(output_md)
    outputs["latestApprovedBranchRenderExecutorOpenCommand"] = str(output_open)
    outputs["latestApprovedBranchRenderCommand"] = str(output_render)
    history = outputs.setdefault("approvedBranchRenderExecutors", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["latestApprovedBranchRenderExecutorGeneratedAt"] = generated_at
    manifest["approvedBranchRenderExecutorCount"] = len(history)
    manifest["approvedBranchRenderExecutorStatus"] = status
    manifest["approvedBranchRenderCommandsExposed"] = can_execute
    manifest["approvedBranchRenderExecutorCanExecuteRealRenders"] = can_execute
    manifest["approvedBranchRenderExecutorSourceAwareRenderContractReady"] = bool(source_aware_contract["ready"])
    manifest["approvedBranchRenderExecutorInheritsSourceAwareAudioTruth"] = bool(source_aware_contract["inheritsSourceAwareAudioTruth"])
    manifest["approvedBranchRenderExecutorSourceAwareAudioContractStatus"] = source_aware_contract["status"]
    manifest["approvedBranchRenderExecutorSourceAwareAudioRoleIds"] = source_aware_contract["roleIds"]
    manifest["approvedBranchRenderExecutorSourceAwareAudioMissingRoleIds"] = source_aware_contract["missingRoleIds"]
    manifest["approvedBranchRenderExecutorSourceAwareAudioReadyStemCount"] = source_aware_contract["readyStemCount"]
    manifest["approvedBranchRenderExecutorMasteredSpineOnlyEditingAllowed"] = bool(source_aware_contract["masteredSpineOnlyEditingAllowed"])
    manifest["approvedBranchRenderExecutorBranchAudioPlanStatus"] = branch_audio_plan["status"]
    manifest["approvedBranchRenderExecutorBranchAudioPlanReportPath"] = branch_audio_plan["reportPath"]
    manifest["approvedBranchRenderExecutorBranchAudioPlanSelectedRefinedStemCount"] = branch_audio_plan["selectedRefinedStemCount"]
    manifest["approvedBranchRenderExecutorBranchAudioPlanSelectedRefinedStems"] = branch_audio_plan["selectedRefinedStems"]
    manifest["approvedBranchRenderExecutorBranchAudioPlanMissingRoleIds"] = branch_audio_plan["missingRoleIds"]
    manifest["approvedBranchRenderExecutorBranchAudioPlanMissingStemPathCount"] = branch_audio_plan["missingStemPathCount"]
    manifest["approvedBranchRenderExecutorBranchRenderAudioTruth"] = "source-aware-refined-stems"
    manifest["approvedBranchRenderExecutorSourceAwareBranchRenderWillUseRefinedStems"] = bool(source_aware_contract["ready"] and branch_audio_plan["ready"])
    manifest["approvedBranchRenderExecutorSourceAwareBranchRenderStemPathsProved"] = bool(branch_audio_plan["ready"])
    manifest["approvedBranchRenderExecutorSourceAwareBranchRenderExpectedMixOutputName"] = branch_audio_plan["expectedMixOutputName"]
    manifest["approvedBranchRenderExecutorMasteredSpineOnlyBranchRenderPrevented"] = not bool(source_aware_contract["masteredSpineOnlyEditingAllowed"]) and not bool(branch_audio_plan["branchAudioRenderedFromMasteredSpineOnly"])
    manifest["approvedBranchRenderExecutorMasteredSpineUse"] = "review-export-premiere-final-podcast-convenience-not-editable-branch-truth"
    manifest["approvedBranchRenderExecutorExecuteRequested"] = bool(args.execute)
    manifest["approvedBranchRenderExecutorBlockerCount"] = len(blockers)
    manifest["approvedBranchRenderExecutorResultCount"] = len(results)
    manifest["approvedBranchRenderCommandPresent"] = True
    manifest["approvedBranchRenderCommandPath"] = str(output_render)
    manifest["approvedBranchRenderExecutorApprovalStateChanged"] = False
    manifest["approvedBranchRenderExecutorBranchStateChanged"] = False
    manifest["approvedBranchRenderExecutorRenderAttempted"] = bool(args.execute and can_execute)
    manifest["approvedBranchRenderExecutorUploadAttempted"] = False
    manifest["approvedBranchRenderExecutorPublicationAttempted"] = False
    manifest["approvedBranchRenderExecutorOriginalMediaMutated"] = False
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

    print(f"Wrote {output_md}")
    print(f"Wrote {output_json}")
    print(f"Wrote {output_open}")
    print(f"Status: {status}")
    print(f"Commands exposed: {can_execute}")


if __name__ == "__main__":
    main()
