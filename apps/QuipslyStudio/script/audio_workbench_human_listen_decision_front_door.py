#!/usr/bin/env python3
"""Create a stable human-listen decision front door for an audio baseline.

This is a routing surface, not an approval tool. It gathers the current listen
surfaces, exported-notes path, guarded decision commands, post-listen gates, and
render locks into one durable place so a reviewer can decide calmly after an
actual listen.

It does not approve audio, fail audio, unlock branch inheritance, render
branches, upload files, publish, or mutate original media.
"""

from __future__ import annotations

import argparse
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APPROVED_STATUSES = {
    "human-approved-for-branch-inheritance",
    "human-approved-for-publication",
}


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


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in ("path", "markdownPath", "htmlPath", "openCommand", "m4aPath", "playlistPath"):
            path = value.get(key)
            if isinstance(path, str) and path:
                return path
    return None


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def escape(value: Any) -> str:
    return html.escape(str(value))


def load_report(outputs: dict[str, Any], key: str) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    if not path or not Path(path).exists() or Path(path).suffix.lower() != ".json":
        return {}
    try:
        return read_json(Path(path))
    except json.JSONDecodeError:
        return {}


def artifact(outputs: dict[str, Any], label: str, key: str, why: str) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    return {
        "label": label,
        "key": key,
        "path": path,
        "exists": bool(path and Path(path).exists()),
        "why": why,
    }


def write_open_command(path: Path, target: Path) -> None:
    path.write_text(
        "\n".join([
            "#!/bin/sh",
            "set -e",
            "open " + shell_quote(str(target)),
            "",
        ]),
        encoding="utf-8",
    )
    path.chmod(0o755)


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def write_record_decision_command(path: Path, baseline_dir: Path) -> None:
    repo = repo_root()
    path.write_text(
        "\n".join(
            [
                "#!/bin/sh",
                "set -eu",
                "REPO=" + shell_quote(str(repo)),
                "BASE=" + shell_quote(str(baseline_dir)),
                "cd \"$REPO\"",
                "printf '\\nEpisode 4 v006 audio-spine decision recorder\\n'",
                "printf 'This records the human-listen decision only. It does not render, upload, publish, or mutate original media.\\n\\n'",
                "printf 'Human path:\\n'",
                "printf '  1. Listen to: %s\\n' \"$BASE/episode4-mastered-audio-spine-v006.m4a\"",
                "printf '  2. If it passes, tell Codex: Approve v006 audio spine\\n'",
                "printf '  3. If it fails or needs proof, paste timestamp notes to Codex first.\\n\\n'",
                "printf 'This terminal recorder is guarded bookkeeping after the listen.\\n\\n'",
                "printf 'Checking current listen package before accepting a decision...\\n'",
                "python3 apps/QuipslyStudio/script/audio_workbench_fast_readback_check.py --baseline-dir \"$BASE\" >/dev/null",
                "python3 - \"$BASE\" <<'PY'",
                "import json",
                "import sys",
                "from pathlib import Path",
                "base = Path(sys.argv[1])",
                "report = json.loads((base / 'AUDIO_FAST_READBACK_CHECK.json').read_text(encoding='utf-8'))",
                "errors = []",
                "if not report.get('passed'):",
                "    errors.append('fast readback did not pass')",
                "if int(report.get('hardStopCount') or 0) != 0:",
                "    errors.append(f\"hard stops present: {report.get('hardStopCount')}\")",
                "if report.get('approvalStatus') != 'machine-candidate-needs-human-listen-proof':",
                "    errors.append(f\"unexpected approval status: {report.get('approvalStatus')}\")",
                "if report.get('finalEpisodeGateStatus') != 'locked-until-audio-spine-approved':",
                "    errors.append(f\"unexpected final episode gate: {report.get('finalEpisodeGateStatus')}\")",
                "if report.get('shortsGateStatus') != 'locked-until-audio-spine-approved':",
                "    errors.append(f\"unexpected shorts gate: {report.get('shortsGateStatus')}\")",
                "if report.get('postApprovalApprovedSandboxExecutorSourceAwareRenderContractReady') is not True:",
                "    errors.append('approved branch executor source-aware contract is not ready')",
                "if report.get('postApprovalApprovedSandboxExecutorInheritsSourceAwareAudioTruth') is not True:",
                "    errors.append('approved branch executor does not inherit source-aware audio truth')",
                "if report.get('postApprovalApprovedSandboxExecutorSourceAwareAudioContractStatus') != 'ready-source-aware-editable':",
                "    errors.append(f\"approved branch executor source-aware status is {report.get('postApprovalApprovedSandboxExecutorSourceAwareAudioContractStatus')}\")",
                "required_roles = {'charlie', 'homer', 'clip-source'}",
                "actual_roles = set(str(role) for role in (report.get('postApprovalApprovedSandboxExecutorSourceAwareAudioRoleIds') or []))",
                "missing_roles = sorted(required_roles - actual_roles)",
                "if missing_roles:",
                "    errors.append('approved branch executor missing source-aware roles: ' + ', '.join(missing_roles))",
                "if report.get('postApprovalApprovedSandboxExecutorMasteredSpineOnlyEditingAllowed') is not False:",
                "    errors.append('approved branch executor mastered-spine-only branch path is not allowed')",
                "if report.get('postListenRefreshStatus') != 'post-listen-refresh-waiting-for-human-listen':",
                "    errors.append(f\"post-listen refresh status is {report.get('postListenRefreshStatus')}\")",
                "if int(report.get('postListenRefreshStepFailureCount') or 0) != 0:",
                "    errors.append(f\"post-listen refresh step failures: {report.get('postListenRefreshStepFailureCount')}\")",
                "if int(report.get('postListenRefreshHardStopCount') or 0) != 0:",
                "    errors.append(f\"post-listen refresh hard stops: {report.get('postListenRefreshHardStopCount')}\")",
                "if report.get('postListenRefreshBranchRenderAudioTruth') != 'source-aware-refined-stems':",
                "    errors.append(f\"post-listen refresh audio truth is {report.get('postListenRefreshBranchRenderAudioTruth')}\")",
                "if report.get('postListenRefreshMasteredSpineOnlyEditingAllowed') is not False:",
                "    errors.append('post-listen refresh mastered-spine-only editing is not allowed')",
                "if report.get('postListenRefreshBranchPreflightBranchAudioPlanStatus') != 'ready-source-aware-refined-stem-plan':",
                "    errors.append(f\"post-listen branch preflight plan is {report.get('postListenRefreshBranchPreflightBranchAudioPlanStatus')}\")",
                "if int(report.get('postListenRefreshBranchPreflightBranchAudioPlanSelectedRefinedStemCount') or 0) < 3:",
                "    errors.append('post-listen branch preflight has too few refined stems')",
                "preflight_missing_roles = sorted(str(role) for role in (report.get('postListenRefreshBranchPreflightBranchAudioPlanMissingRoleIds') or []))",
                "if preflight_missing_roles:",
                "    errors.append('post-listen branch preflight missing refined-stem roles: ' + ', '.join(preflight_missing_roles))",
                "if int(report.get('postListenRefreshBranchPreflightBranchAudioPlanMissingStemPathCount') or 0) != 0:",
                "    errors.append('post-listen branch preflight has missing refined stem paths')",
                "if report.get('postListenRefreshBranchPreflightSourceAwareBranchRenderStemPathsProved') is not True:",
                "    errors.append('post-listen branch preflight did not prove refined stem paths')",
                "if report.get('postListenRefreshBranchExecutorBranchAudioPlanStatus') != 'ready-source-aware-refined-stem-plan':",
                "    errors.append(f\"post-listen branch executor plan is {report.get('postListenRefreshBranchExecutorBranchAudioPlanStatus')}\")",
                "if int(report.get('postListenRefreshBranchExecutorBranchAudioPlanSelectedRefinedStemCount') or 0) < 3:",
                "    errors.append('post-listen branch executor has too few refined stems')",
                "executor_missing_roles = sorted(str(role) for role in (report.get('postListenRefreshBranchExecutorBranchAudioPlanMissingRoleIds') or []))",
                "if executor_missing_roles:",
                "    errors.append('post-listen branch executor missing refined-stem roles: ' + ', '.join(executor_missing_roles))",
                "if int(report.get('postListenRefreshBranchExecutorBranchAudioPlanMissingStemPathCount') or 0) != 0:",
                "    errors.append('post-listen branch executor has missing refined stem paths')",
                "if report.get('postListenRefreshBranchExecutorSourceAwareBranchRenderWillUseRefinedStems') is not True:",
                "    errors.append('post-listen branch executor will not use refined stems')",
                "if report.get('postListenRefreshBranchExecutorSourceAwareBranchRenderStemPathsProved') is not True:",
                "    errors.append('post-listen branch executor did not prove refined stem paths')",
                "if report.get('renderAttempted') or report.get('uploadAttempted') or report.get('publicationAttempted') or report.get('originalMediaMutated'):",
                "    errors.append('safety flag changed before human decision')",
                "if errors:",
                "    print('Refusing to record a human decision because package truth is not safe:')",
                "    for error in errors:",
                "        print(f'  - {error}')",
                "    sys.exit(2)",
                "print('Fast readback OK: package coherent, gates locked, post-listen refined-stem branch plan ready, no mutation flags changed.')",
                "PY",
                "printf '\\n'",
                "printf 'Choose one after a real listen:\\n'",
                "printf '  approve      Approve v006 for source-aware branch-gate review, not publication\\n'",
                "printf '  needs-proof  Keep v006 locked and request focused proof\\n'",
                "printf '  fail         Keep v006 locked and request scoped v007 repair\\n'",
                "printf '  quit         Exit without changing anything\\n\\n'",
                "printf 'Decision: '",
                "IFS= read -r DECISION",
                "case \"$DECISION\" in",
                "  approve) STATUS='human-approved-for-branch-inheritance' ;;",
                "  needs-proof|proof) STATUS='needs-focused-proof' ;;",
                "  fail|failed) STATUS='failed-human-listen' ;;",
                "  quit|'') printf 'No change recorded.\\n'; exit 0 ;;",
                "  *) printf 'Unknown decision: %s\\n' \"$DECISION\"; exit 2 ;;",
                "esac",
                "printf 'Reviewer name [Charlie]: '",
                "IFS= read -r REVIEWER",
                "if [ -z \"$REVIEWER\" ]; then REVIEWER='Charlie'; fi",
                "ISSUE=''",
                "if [ \"$STATUS\" = 'needs-focused-proof' ] || [ \"$STATUS\" = 'failed-human-listen' ]; then",
                "  printf 'Required issue/time range: '",
                "  IFS= read -r ISSUE",
                "  if [ -z \"$ISSUE\" ]; then printf 'Issue/time range is required for this decision.\\n'; exit 2; fi",
                "fi",
                "printf 'Notes: '",
                "IFS= read -r NOTES",
                "if [ -z \"$NOTES\" ]; then",
                "  case \"$STATUS\" in",
                "    human-approved-for-branch-inheritance) NOTES='Human listened to v006 and approves the audio spine for source-aware branch-gate review. Branch inheritance still requires the gate to prove refined stems and timing; publication still requires separate platform review.' ;;",
                "    needs-focused-proof) NOTES='Human listened to v006 and requests focused proof before branch inheritance.' ;;",
                "    failed-human-listen) NOTES='Human listened to v006 and requests scoped v007 repair.' ;;",
                "  esac",
                "fi",
                "printf '\\nType exactly I LISTENED to record this decision: '",
                "IFS= read -r CONFIRMATION",
                "if [ \"$CONFIRMATION\" != 'I LISTENED' ]; then printf 'No change recorded.\\n'; exit 2; fi",
                "printf '\\nRecording decision...\\n'",
                "if [ -n \"$ISSUE\" ]; then",
                "  python3 apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py --baseline-dir \"$BASE\" --status \"$STATUS\" --reviewer \"$REVIEWER\" --notes \"$NOTES\" --issue \"$ISSUE\" --confirm-human-listened",
                "else",
                "  python3 apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py --baseline-dir \"$BASE\" --status \"$STATUS\" --reviewer \"$REVIEWER\" --notes \"$NOTES\" --confirm-human-listened",
                "fi",
                "printf '\\nRefreshing post-decision gates...\\n'",
                "python3 apps/QuipslyStudio/script/audio_workbench_post_listen_refresh.py --baseline-dir \"$BASE\"",
                "printf '\\nDecision recorded and gates refreshed.\\n'",
                "printf 'If you approved v006, branch rendering is eligible only after the source-aware gate and preflight pass. This still did not publish anything.\\n'",
                "",
            ]
        ),
        encoding="utf-8",
    )
    path.chmod(0o755)


def command_block(command: str) -> str:
    return "```bash\n" + command + "\n```"


def int_value(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def float_value(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def build_commands(baseline_dir: Path) -> dict[str, str]:
    out = shell_quote(str(baseline_dir))
    notes_placeholder = shell_quote("/path/to/imported-reviewer-notes-packet.json")
    return {
        "dryRunImportedNotes": "\n".join([
            f"OUT={out}",
            "python3 apps/QuipslyStudio/script/audio_workbench_record_listen_decision_from_notes.py \\",
            "  --baseline-dir \"$OUT\" \\",
            f"  --notes-packet {notes_placeholder} \\",
            "  --reviewer \"Charlie or Mako\" \\",
            "  --dry-run",
        ]),
        "recordImportedNotesAfterListen": "\n".join([
            f"OUT={out}",
            "python3 apps/QuipslyStudio/script/audio_workbench_record_listen_decision_from_notes.py \\",
            "  --baseline-dir \"$OUT\" \\",
            f"  --notes-packet {notes_placeholder} \\",
            "  --reviewer \"Charlie or Mako\" \\",
            "  --confirm-human-listened",
        ]),
        "directApproveBranchInheritance": "\n".join([
            f"OUT={out}",
            "python3 apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py \\",
            "  --baseline-dir \"$OUT\" \\",
            "  --status human-approved-for-branch-inheritance \\",
            "  --reviewer \"Charlie or Mako\" \\",
            "  --notes \"Human listened to the required review route and approves this v006 spine for branch inheritance.\" \\",
            "  --confirm-human-listened",
        ]),
        "codexDryRunPlainDecision": "\n".join([
            f"OUT={out}",
            "python3 apps/QuipslyStudio/script/audio_workbench_codex_listen_decision_intake.py \\",
            "  --baseline-dir \"$OUT\" \\",
            "  --utterance \"Approve v006 audio spine\" \\",
            "  --reviewer \"Charlie\" \\",
            "  --confirm-human-listened",
        ]),
        "codexRecordPlainApproveAfterListen": "\n".join([
            f"OUT={out}",
            "python3 apps/QuipslyStudio/script/audio_workbench_codex_listen_decision_intake.py \\",
            "  --baseline-dir \"$OUT\" \\",
            "  --utterance \"Approve v006 audio spine\" \\",
            "  --reviewer \"Charlie\" \\",
            "  --confirm-human-listened \\",
            "  --record",
        ]),
        "codexRecordPlainNeedsProofAfterListen": "\n".join([
            f"OUT={out}",
            "python3 apps/QuipslyStudio/script/audio_workbench_codex_listen_decision_intake.py \\",
            "  --baseline-dir \"$OUT\" \\",
            "  --utterance \"Needs proof around 57:10\" \\",
            "  --reviewer \"Charlie\" \\",
            "  --confirm-human-listened \\",
            "  --record",
        ]),
        "codexRecordPlainFailAfterListen": "\n".join([
            f"OUT={out}",
            "python3 apps/QuipslyStudio/script/audio_workbench_codex_listen_decision_intake.py \\",
            "  --baseline-dir \"$OUT\" \\",
            "  --utterance \"Fail, describe the exact audio issue and time range\" \\",
            "  --reviewer \"Charlie\" \\",
            "  --confirm-human-listened \\",
            "  --record",
        ]),
        "directNeedsFocusedProof": "\n".join([
            f"OUT={out}",
            "python3 apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py \\",
            "  --baseline-dir \"$OUT\" \\",
            "  --status needs-focused-proof \\",
            "  --reviewer \"Charlie or Mako\" \\",
            "  --issue \"Describe the exact moment that needs more proof.\" \\",
            "  --notes \"Human listened and wants focused proof before branch inheritance.\" \\",
            "  --confirm-human-listened",
        ]),
        "directFailForRepair": "\n".join([
            f"OUT={out}",
            "python3 apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py \\",
            "  --baseline-dir \"$OUT\" \\",
            "  --status failed-human-listen \\",
            "  --reviewer \"Charlie or Mako\" \\",
            "  --issue \"Describe the exact audio issue and time range.\" \\",
            "  --notes \"Human listened and requests a scoped v007 repair candidate.\" \\",
            "  --confirm-human-listened",
        ]),
        "afterDecisionRefresh": "\n".join([
            f"OUT={out}",
            "python3 apps/QuipslyStudio/script/audio_workbench_post_listen_refresh.py --baseline-dir \"$OUT\"",
        ]),
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Human Listen Decision Front Door: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "## Human path",
        "",
        "1. Listen to `episode4-mastered-audio-spine-v006.m4a`.",
        "2. If it sounds good, tell Codex: `Approve v006 audio spine`.",
        "3. If it sounds wrong, paste rough timestamp notes to Codex, for example `34:22 Charlie sounds gated`.",
        "4. If uncertain, tell Codex: `Needs proof` plus the timestamp or symptom.",
        "",
        "You do not have to start with this command page. This page is the guarded bookkeeping and evidence route after the human listen.",
        "",
        "This is the stable decision-routing surface after a real listen. It does not approve audio, fail audio, unlock branch inheritance, render branches, upload, publish, or mutate original media by itself.",
        "",
        "The guarded recorder refuses approval unless fast readback proves the future branch executor still inherits source-aware Charlie/Homer/clip stems and rejects a mastered-spine-only render path.",
        "",
        "## Current truth",
        "",
        f"- Status: `{report['status']}`",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Missing required decision artifacts: `{report['missingRequiredArtifactCount']}`",
        "",
        "## Reviewer path",
        "",
        "1. Open START_HERE or the Producer Command Center.",
        "2. Listen through the Human Listen Mission Reel as the fast pass.",
        "3. Use the Mission Board, Audio Defect Atlas, Source-Balance Triage, Speaker Cleanup Acceptance Board, and Speaker Cleanup Listen Reel to check every required focus window.",
        "4. Capture notes in the reviewer notes template, Mission Reel notes template, or control room.",
        "5. Run the imported-notes command in dry-run first.",
        "6. Only after a real human listen, run the guarded decision command with `--confirm-human-listened`.",
        "7. Run the post-listen refresh seam before any branch render; it refreshes the source-aware branch gate, preflight, executor, router, and runway in order.",
        "",
        "## Review runway checklist",
        "",
        f"- Mission Board status: `{report['reviewRunway']['missionBoardStatus']}`",
        f"- Mission focus windows: `{report['reviewRunway']['missionFocusWindowCount']}`",
        f"- Mission Reel items: `{report['reviewRunway']['missionReelItemCount']}`",
        f"- Mission Reel duration: `{report['reviewRunway']['missionReelDurationSeconds']}s`",
        f"- Source-balance warnings: `{report['reviewRunway']['sourceBalanceWarningCount']}`",
        f"- Source-balance triage windows: `{report['reviewRunway']['sourceBalanceTriageWindowCount']}`",
        f"- Source-balance queue items: `{report['reviewRunway']['sourceBalanceQueueItemCount']}`",
        f"- All registered speakers survive in master: `{str(report['reviewRunway']['allSpeakersSurviveInMaster']).lower()}`",
        f"- Speaker cleanup machine checks: `{report['reviewRunway']['speakerCleanupPassedCount']}/{report['reviewRunway']['speakerCleanupCheckCount']}`",
        f"- Speaker cleanup must-listen windows: `{report['reviewRunway']['speakerCleanupMustListenCount']}`",
        f"- Speaker cleanup listen reel: `{report['reviewRunway']['speakerCleanupListenReelItemCount']} items / {report['reviewRunway']['speakerCleanupListenReelDurationSeconds']}s / missing {report['reviewRunway']['speakerCleanupListenReelMissingSnippetCount']}`",
        f"- Sound Director score: `{report['reviewRunway']['soundDirectorMachineConfidenceScore']}`",
        f"- Audio Defect Atlas: `{report['reviewRunway']['defectAtlasItemCount']} items / high {report['reviewRunway']['defectAtlasHighSeverityCount']} / missing {report['reviewRunway']['defectAtlasMissingEvidenceCount']}`",
        f"- Sound Director review risks: `{report['reviewRunway']['soundDirectorReviewRiskCount']}`",
        f"- Post-review repair actions waiting: `{report['reviewRunway']['postReviewRepairActionCount']}`",
        f"- Post-review focused-proof actions waiting: `{report['reviewRunway']['postReviewFocusedProofActionCount']}`",
        f"- Scoped v007 plan status: `{report['reviewRunway']['scopedV007PlanStatus']}`",
        f"- Scoped v007 queue status: `{report['reviewRunway']['scopedV007PlanQueueStatus']}`",
        f"- Scoped v007 planned candidates: `{report['reviewRunway']['scopedV007PlanPlannedItemCount']}`",
        f"- Scoped v007 planner smoke: `{str(report['reviewRunway']['scopedV007PlanSmokePassed']).lower()}` / failures `{report['reviewRunway']['scopedV007PlanSmokeFailureCount']}`",
        "",
        "Pass means: the full spine and required focus windows sound natural enough for branch inheritance. Needs-proof means: ears found uncertainty but not a confirmed repair. Fail means: a specific time range needs a scoped v007 repair candidate.",
        "",
        "## Required decision artifacts",
        "",
        "| Artifact | Exists | Path | Why |",
        "|---|---:|---|---|",
    ]
    for item in report["requiredArtifacts"]:
        lines.append(
            f"| {item['label']} | `{str(item['exists']).lower()}` | `{item.get('path') or 'not registered'}` | {item['why']} |"
        )
    lines.extend(["", "## Safe commands", ""])
    commands = report["commands"]
    command_labels = [
        ("Dry-run plain Codex decision intake", "codexDryRunPlainDecision"),
        ("Record plain Codex approval after real listen", "codexRecordPlainApproveAfterListen"),
        ("Record plain Codex needs-proof after real listen", "codexRecordPlainNeedsProofAfterListen"),
        ("Record plain Codex failure after real listen", "codexRecordPlainFailAfterListen"),
        ("Dry-run imported reviewer notes", "dryRunImportedNotes"),
        ("Record imported reviewer notes after real listen", "recordImportedNotesAfterListen"),
        ("Direct approval for branch inheritance", "directApproveBranchInheritance"),
        ("Direct needs-focused-proof decision", "directNeedsFocusedProof"),
        ("Direct failure/repair decision", "directFailForRepair"),
        ("Refresh post-decision gates", "afterDecisionRefresh"),
    ]
    for title, key in command_labels:
        lines.extend([f"### {title}", "", command_block(commands[key]), ""])
    lines.extend([
        "## One-step guarded decision command",
        "",
        "If you listened and want the least fussy route, run the stable command below. It asks for approve / needs-proof / fail, requires `I LISTENED`, verifies fast readback plus the post-listen source-aware refined-stem branch plan, records the same strict manifest decision, and refreshes the post-listen gates. It does not publish or mutate source media.",
        "",
        f"- `{report['recordDecisionCommand']}`",
        "",
    ])
    lines.extend([
        "## Guardrail",
        "",
        "Passing notes, all-pass snippets, or a generated template are not approval. Approval is only real after a human listen decision is recorded through the guarded recorder. If anything fails, preserve v006 and create a scoped v007/timestamped repair candidate instead of overwriting this one.",
        "",
    ])
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    artifact_cards = []
    for item in report["requiredArtifacts"]:
        state = "ok" if item["exists"] else "bad"
        artifact_cards.append(
            f"<article class='card {state}'><h3>{escape(item['label'])}</h3>"
            f"<p>{escape(item['why'])}</p><p><b>{'Present' if item['exists'] else 'Missing'}</b></p>"
            f"<code>{escape(item.get('path') or 'not registered')}</code></article>"
        )
    command_cards = []
    for title, key in [
        ("Dry-run imported notes", "dryRunImportedNotes"),
        ("Record notes after real listen", "recordImportedNotesAfterListen"),
        ("Approve branch inheritance", "directApproveBranchInheritance"),
        ("Needs focused proof", "directNeedsFocusedProof"),
        ("Fail and route repair", "directFailForRepair"),
        ("Refresh gates", "afterDecisionRefresh"),
    ]:
        command_cards.append(
            f"<article class='command'><h3>{escape(title)}</h3><pre>{escape(report['commands'][key])}</pre></article>"
        )
    runway = report["reviewRunway"]
    runway_cards = [
        ("Mission", f"{runway['missionFocusWindowCount']} focus windows", f"{runway['missionReelItemCount']} reel items / {runway['missionReelDurationSeconds']}s"),
        ("Source balance", f"{runway['sourceBalanceTriageWindowCount']} triage windows", f"{runway['sourceBalanceWarningCount']} warnings / speakers survive {str(runway['allSpeakersSurviveInMaster']).lower()}"),
        ("Speaker cleanup", f"{runway['speakerCleanupPassedCount']}/{runway['speakerCleanupCheckCount']} checks", f"{runway['speakerCleanupMustListenCount']} must-listen windows"),
        ("Sound Director", f"score {runway['soundDirectorMachineConfidenceScore']}", f"{runway['soundDirectorReviewRiskCount']} review risks"),
        ("Post-review queue", f"{runway['postReviewRepairActionCount']} repairs", f"{runway['postReviewFocusedProofActionCount']} focused-proof actions"),
        ("Scoped v007 repair", f"{runway['scopedV007PlanPlannedItemCount']} planned candidates", f"{runway['scopedV007PlanStatus']} / smoke {str(runway['scopedV007PlanSmokePassed']).lower()}"),
    ]
    runway_html = "".join(
        f"<article class='card ok'><h3>{escape(title)}</h3><p><b>{escape(metric)}</b></p><p>{escape(detail)}</p></article>"
        for title, metric, detail in runway_cards
    )
    return f"""<!doctype html>
<html lang='en'>
<head>
<meta charset='utf-8' />
<title>Human Listen Decision Front Door</title>
<style>
:root {{ color-scheme: dark; --bg:#111711; --panel:#1d271f; --ink:#f3ecd8; --muted:#c9bfa8; --gold:#d8b64c; --green:#77d489; --red:#e46c6c; --line:#43513f; }}
body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:radial-gradient(circle at 20% 0%, #293725, var(--bg)); color:var(--ink); }}
main {{ max-width:1180px; margin:0 auto; padding:36px; }}
header {{ border:1px solid var(--line); background:rgba(29,39,31,.88); border-radius:24px; padding:28px; box-shadow:0 18px 50px rgba(0,0,0,.28); }}
h1 {{ margin:0 0 8px; font-size:34px; }}
.hero {{ border:1px solid #7b6a32; background:linear-gradient(135deg, rgba(64,76,38,.95), rgba(27,43,34,.95)); border-radius:24px; padding:28px; margin-bottom:18px; }}
.hero h1 {{ font-size:38px; }}
.hero li {{ margin:10px 0; font-size:18px; }}
.calm {{ color:#d8e7bd; font-weight:700; }}
.badge {{ display:inline-block; padding:7px 11px; border-radius:999px; background:#2a3428; color:var(--muted); margin:5px 6px 0 0; font-weight:700; }}
.badge.locked {{ color:var(--gold); }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:14px; margin:22px 0; }}
.card,.command {{ border:1px solid var(--line); background:rgba(24,31,24,.9); border-radius:18px; padding:16px; }}
.card.ok h3 {{ color:var(--green); }} .card.bad h3 {{ color:var(--red); }}
p {{ color:var(--muted); line-height:1.5; }} code, pre {{ white-space:pre-wrap; word-break:break-word; color:#ffeeb0; }}
pre {{ background:#0a0d0a; border-radius:12px; padding:12px; overflow:auto; }}
</style>
</head>
<body><main>
<section class='hero'>
<p class='badge locked'>Human path</p>
<h1>Listen first. Tell Codex the result.</h1>
<ol>
<li>Listen to <code>episode4-mastered-audio-spine-v006.m4a</code>.</li>
<li>If it passes, tell Codex <code>Approve v006 audio spine</code>.</li>
<li>If it fails, paste timestamp notes like <code>34:22 Charlie sounds gated</code>.</li>
<li>If unsure, say <code>Needs proof</code> plus the time or symptom.</li>
</ol>
<p class='calm'>This page is the guarded machinery after the listen. You do not need to drive the whole machine by hand first.</p>
</section>
<header>
<p class='badge locked'>Quipsly Audio Workbench</p>
<h1>Human listen decision front door</h1>
<p>Listen first. Record notes. Dry-run the route. Then, and only then, use the guarded decision command.</p>
<div>
<span class='badge locked'>status: {escape(report['status'])}</span>
<span class='badge'>approval: {escape(report['approvalStatus'])}</span>
<span class='badge'>branch inheritance: {str(report['branchInheritanceReady']).lower()}</span>
<span class='badge'>branch render: {str(report['branchRenderReady']).lower()}</span>
<span class='badge'>missing: {report['missingRequiredArtifactCount']}</span>
</div>
</header>
<section><h2>Review runway checklist</h2><p>This is the minimum listen map before the guarded decision command is allowed to mean anything.</p><div class='grid'>{runway_html}</div></section>
<section class='card'><h2>One-step guarded decision command</h2><p>After a real listen, run this if you want the calm path. It asks for approve, needs-proof, or fail; requires <code>I LISTENED</code>; verifies fast readback plus the post-listen source-aware refined-stem branch plan; records the strict decision; and refreshes the post-listen gates. It does not publish anything.</p><code>{escape(report['recordDecisionCommand'])}</code></section>
<section><h2>Required artifacts</h2><div class='grid'>{''.join(artifact_cards)}</div></section>
<section><h2>Safe commands</h2><div class='grid'>{''.join(command_cards)}</div></section>
<section class='card'><h2>Guardrail</h2><p>Nothing on this page approves v006 by itself. If the listen fails or needs more proof, preserve v006 and use the scoped v007 repair candidate plan to route only the exact failed windows. If the listen passes, refresh branch inheritance and branch-render preflight before rendering anything.</p></section>
</main></body></html>"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    approval_status = str(manifest.get("approvalStatus") or "unknown")
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    generated_iso = datetime.now(timezone.utc).isoformat()
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    mission_board = load_report(outputs, "latestAudioHumanListenMissionBoard")
    mission_reel = load_report(outputs, "latestAudioHumanListenMissionReel")
    source_balance_triage = load_report(outputs, "latestAudioSourceBalanceTriage")
    speaker_cleanup = load_report(outputs, "latestSpeakerCleanupAcceptanceBoard")
    speaker_cleanup_listen_reel = load_report(outputs, "latestSpeakerCleanupListenReel")
    sound_director = load_report(outputs, "latestAudioSoundDirectorScorecard")
    defect_atlas = load_report(outputs, "latestAudioDefectAtlas")
    defect_atlas_notes_inbox = load_report(outputs, "latestAudioDefectAtlasNotesInbox")
    defect_atlas_notes_inbox_smoke = load_report(outputs, "latestAudioDefectAtlasNotesInboxSmoke")
    post_review_queue = load_report(outputs, "latestAudioPostReviewActionQueue")
    scoped_v007_plan = load_report(outputs, "latestAudioScopedV007RepairCandidatePlan")
    scoped_v007_plan_smoke = load_report(outputs, "latestAudioScopedV007RepairCandidatePlanSmoke")

    required_artifacts = [
        artifact(outputs, "START_HERE", "latestAudioReviewStartHereMarkdown", "Stable review front door."),
        artifact(outputs, "Producer Command Center", "latestAudioProducerCommandCenterHtml", "Calm current-state review cockpit."),
        artifact(outputs, "Sound Director Scorecard", "latestAudioSoundDirectorScorecardHtml", "One confidence and review-risk map across the audio runway."),
        artifact(outputs, "Audio Defect Atlas", "latestAudioDefectAtlasHtml", "Stage-aware timeline map of audio risks and owning repair stages."),
        artifact(outputs, "Audio Defect Atlas Notes Template", "latestAudioDefectAtlasNotesTemplate", "Machine-readable return packet for scoped atlas item notes."),
        artifact(outputs, "Audio Defect Atlas Notes Inbox", "latestAudioDefectAtlasNotesInboxHtml", "Safe return path for defect-atlas pass/proof/repair notes."),
        artifact(outputs, "Audio Defect Atlas Notes Inbox Smoke", "latestAudioDefectAtlasNotesInboxSmokeMarkdown", "Synthetic proof that atlas notes route safely without approval or branch changes."),
        artifact(outputs, "Human Listen Mission Board", "latestAudioHumanListenMissionBoardHtml", "The focused human listen mission and approval runway."),
        artifact(outputs, "Human Listen Mission Reel", "latestAudioHumanListenMissionReelHtml", "A compact first-pass reel for the most important listen windows."),
        artifact(outputs, "Source-Balance Triage", "latestAudioSourceBalanceTriageHtml", "Turns the large source-balance warning count into representative listen windows."),
        artifact(outputs, "Speaker Cleanup Acceptance Board", "latestSpeakerCleanupAcceptanceBoardHtml", "Machine checks and must-listen windows for speaker cleanup."),
        artifact(outputs, "Speaker Cleanup Listen Reel", "latestSpeakerCleanupListenReelHtml", "Compact M4A review reel for all speaker-cleanup naturalness windows."),
        artifact(outputs, "Audio Runway State", "latestAudioRunwayStateHtml", "One-page lock/readiness readback."),
        artifact(outputs, "Human Approval Preflight", "latestAudioHumanApprovalPreflightHtml", "Final go/no-go before decision routing."),
        artifact(outputs, "Reviewer Notes Template", "latestReviewerNotesTemplateHtml", "Human notes capture/import packet."),
        artifact(outputs, "Human Listen Control Room", "latestAudioHumanListenControlRoomHtml", "Full local listening room with note export."),
        artifact(outputs, "Human Listen Decision Brief", "latestAudioHumanListenDecisionBriefMarkdown", "Plain-English pass/fail/proof criteria."),
        artifact(outputs, "Mission Reel Notes Inbox", "latestAudioHumanListenMissionReelNotesInboxMarkdown", "Focused Mission Reel notes return path into the post-review queue."),
        artifact(outputs, "Listen Proof Coverage Map", "latestAudioListenProofCoverageMapHtml", "Minimum listen route mapped to remaining requirements."),
        artifact(outputs, "Decision Rehearsal", "latestHumanListenDecisionRehearsalMarkdown", "Dry-run proof that routes preserve real state."),
        artifact(outputs, "Post-Review Action Queue", "latestAudioPostReviewActionQueueMarkdown", "Where pass/proof/repair notes land."),
        artifact(outputs, "Scoped v007 Repair Candidate Plan", "latestAudioScopedV007RepairCandidatePlanHtml", "Stage-owned repair/proof plan when returned notes fail or need focused proof."),
        artifact(outputs, "Scoped v007 Repair Candidate Plan Smoke", "latestAudioScopedV007RepairCandidatePlanSmokeHtml", "Synthetic proof that future repair/proof notes route safely without approval or branch changes."),
        artifact(outputs, "Branch Inheritance Gate", "latestBranchInheritanceGateHtml", "Post-approval inheritance lock."),
        artifact(outputs, "Branch Render Preflight", "branchRenderPreflightHtml", "Post-inheritance render lock."),
    ]
    missing = [item for item in required_artifacts if not item["exists"]]
    package_ready = bool(manifest.get("packageReadyForHumanListen"))
    branch_inheritance_ready = bool(manifest.get("branchInheritanceReady"))
    branch_render_ready = bool(manifest.get("branchRenderReady"))
    if missing:
        status = "needs-decision-artifact-repair"
    elif approval_status in APPROVED_STATUSES:
        status = "human-decision-recorded-refresh-branch-gates"
    elif package_ready:
        status = "ready-for-human-listen-decision"
    else:
        status = "not-ready-for-human-listen-decision"
    review_runway = {
        "missionBoardStatus": mission_board.get("status") or "missing",
        "missionFocusWindowCount": int_value(mission_board.get("focusWindowCount")),
        "missionRepairActionCount": int_value(mission_board.get("repairActionCount")),
        "missionReelStatus": mission_reel.get("status") or "missing",
        "missionReelItemCount": int_value(mission_reel.get("itemCount")),
        "missionReelDurationSeconds": round(float_value(mission_reel.get("durationSeconds")), 3),
        "sourceBalanceTriageStatus": source_balance_triage.get("status") or "missing",
        "sourceBalanceWarningCount": int_value(source_balance_triage.get("machineWarningCount")),
        "sourceBalanceTriageWindowCount": int_value(source_balance_triage.get("triageWindowCount")),
        "sourceBalanceQueueItemCount": int_value(source_balance_triage.get("queueBalanceItemCount")),
        "allSpeakersSurviveInMaster": bool(source_balance_triage.get("allSpeakersSurviveInMaster")),
        "speakerCleanupStatus": speaker_cleanup.get("status") or "missing",
        "speakerCleanupCheckCount": int_value(speaker_cleanup.get("machineCheckCount")),
        "speakerCleanupPassedCount": int_value(speaker_cleanup.get("machineCheckPassedCount")),
        "speakerCleanupMustListenCount": int_value(speaker_cleanup.get("mustListenCount")),
        "speakerCleanupListenReelStatus": speaker_cleanup_listen_reel.get("status"),
        "speakerCleanupListenReelItemCount": int_value(speaker_cleanup_listen_reel.get("itemCount")),
        "speakerCleanupListenReelRenderedItemCount": int_value(speaker_cleanup_listen_reel.get("renderedItemCount")),
        "speakerCleanupListenReelMissingSnippetCount": int_value(speaker_cleanup_listen_reel.get("missingSnippetCount")),
        "speakerCleanupListenReelMustListenCount": int_value(speaker_cleanup_listen_reel.get("mustListenCount")),
        "speakerCleanupListenReelDurationSeconds": float_value(speaker_cleanup_listen_reel.get("durationSeconds")),
        "soundDirectorStatus": sound_director.get("status") or "missing",
        "soundDirectorMachineConfidenceScore": sound_director.get("machineConfidenceScore") or 0,
        "soundDirectorReviewRiskCount": int_value(sound_director.get("reviewRiskCount")),
        "defectAtlasStatus": defect_atlas.get("status"),
        "defectAtlasItemCount": int_value((defect_atlas.get("summary") or {}).get("itemCount")),
        "defectAtlasTimedItemCount": int_value((defect_atlas.get("summary") or {}).get("timedItemCount")),
        "defectAtlasHighSeverityCount": int_value((defect_atlas.get("summary") or {}).get("highSeverityCount")),
        "defectAtlasMissingEvidenceCount": int_value((defect_atlas.get("summary") or {}).get("missingEvidenceCount")),
        "defectAtlasNotesInboxStatus": defect_atlas_notes_inbox.get("status"),
        "defectAtlasNotesInboxMatchingCandidateCount": int_value(defect_atlas_notes_inbox.get("matchingCandidateCount")),
        "defectAtlasNotesInboxRepairActionCount": int_value(defect_atlas_notes_inbox.get("repairActionCount")),
        "defectAtlasNotesInboxFocusedProofActionCount": int_value(defect_atlas_notes_inbox.get("focusedProofActionCount")),
        "defectAtlasNotesInboxPassContextCount": int_value(defect_atlas_notes_inbox.get("passContextCount")),
        "defectAtlasNotesInboxSmokePassed": bool(defect_atlas_notes_inbox_smoke.get("passed")),
        "postReviewQueueStatus": post_review_queue.get("status") or "missing",
        "postReviewRepairActionCount": int_value(post_review_queue.get("repairActionCount")),
        "postReviewFocusedProofActionCount": int_value(post_review_queue.get("focusedProofActionCount")),
        "scopedV007PlanStatus": scoped_v007_plan.get("status") or "missing",
        "scopedV007PlanQueueStatus": scoped_v007_plan.get("queueStatus") or "missing",
        "scopedV007PlanSourceWithNotesCandidateCount": int_value(scoped_v007_plan.get("sourceWithNotesCandidateCount")),
        "scopedV007PlanRepairActionCount": int_value(scoped_v007_plan.get("repairActionCount")),
        "scopedV007PlanFocusedProofActionCount": int_value(scoped_v007_plan.get("focusedProofActionCount")),
        "scopedV007PlanPassContextCount": int_value(scoped_v007_plan.get("passContextCount")),
        "scopedV007PlanPlannedItemCount": int_value(scoped_v007_plan.get("plannedItemCount")),
        "scopedV007PlanSmokePassed": bool(scoped_v007_plan_smoke.get("passed")),
        "scopedV007PlanSmokeScenarioCount": int_value(scoped_v007_plan_smoke.get("scenarioCount")),
        "scopedV007PlanSmokeFailureCount": int_value(scoped_v007_plan_smoke.get("failureCount")),
    }

    report = {
        "schema": "quipsly.audio-workbench.human-listen-decision-front-door.v1",
        "generatedAt": generated_iso,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "status": status,
        "approvalStatus": approval_status,
        "packageReadyForHumanListen": package_ready,
        "branchInheritanceReady": branch_inheritance_ready,
        "branchRenderReady": branch_render_ready,
        "reviewRunway": review_runway,
        "requiredArtifacts": required_artifacts,
        "missingRequiredArtifactCount": len(missing),
        "commands": build_commands(baseline_dir),
        "recordDecisionCommand": str(baseline_dir / "RECORD_EPISODE_4_AUDIO_DECISION.command"),
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
        "nextSafeAction": "Listen, export/import notes, dry-run decision routing, then record a guarded decision only after real human review.",
    }

    stable_json = baseline_dir / "HUMAN_LISTEN_DECISION_FRONT_DOOR.json"
    stable_md = baseline_dir / "HUMAN_LISTEN_DECISION_FRONT_DOOR.md"
    stable_html = baseline_dir / "HUMAN_LISTEN_DECISION_FRONT_DOOR.html"
    stable_open = baseline_dir / "OPEN_HUMAN_LISTEN_DECISION_FRONT_DOOR.command"
    stable_record_decision = baseline_dir / "RECORD_EPISODE_4_AUDIO_DECISION.command"
    versioned_dir = baseline_dir / f"human-listen-decision-front-door-{slug}-{generated_at}"
    versioned_dir.mkdir(parents=True, exist_ok=True)
    versioned_json = versioned_dir / "human-listen-decision-front-door.json"
    versioned_md = versioned_dir / "human-listen-decision-front-door.md"
    versioned_html = versioned_dir / "human-listen-decision-front-door.html"
    versioned_open = versioned_dir / "open-human-listen-decision-front-door.command"
    versioned_record_decision = versioned_dir / "record-episode-4-audio-decision.command"

    markdown = render_markdown(report)
    rendered_html = render_html(report)
    for path in (stable_json, versioned_json):
        write_json(path, report)
    for path in (stable_md, versioned_md):
        path.write_text(markdown, encoding="utf-8")
    for path in (stable_html, versioned_html):
        path.write_text(rendered_html, encoding="utf-8")
    write_open_command(stable_open, stable_html)
    write_open_command(versioned_open, versioned_html)
    write_record_decision_command(stable_record_decision, baseline_dir)
    write_record_decision_command(versioned_record_decision, baseline_dir)

    outputs["latestHumanListenDecisionFrontDoor"] = str(stable_json)
    outputs["latestHumanListenDecisionFrontDoorMarkdown"] = str(stable_md)
    outputs["latestHumanListenDecisionFrontDoorHtml"] = str(stable_html)
    outputs["latestHumanListenDecisionFrontDoorOpenCommand"] = str(stable_open)
    outputs["latestHumanListenDecisionRecordCommand"] = str(stable_record_decision)
    outputs["latestHumanListenDecisionFrontDoorVersioned"] = str(versioned_json)
    outputs["latestHumanListenDecisionFrontDoorVersionedMarkdown"] = str(versioned_md)
    outputs["latestHumanListenDecisionFrontDoorVersionedHtml"] = str(versioned_html)
    outputs["latestHumanListenDecisionFrontDoorVersionedOpenCommand"] = str(versioned_open)
    outputs["latestHumanListenDecisionRecordCommandVersioned"] = str(versioned_record_decision)
    history = outputs.setdefault("humanListenDecisionFrontDoors", [])
    if str(versioned_json) not in history:
        history.append(str(versioned_json))
    manifest["humanListenDecisionFrontDoorStatus"] = status
    manifest["humanListenDecisionFrontDoorCount"] = len(history)
    manifest["humanListenDecisionFrontDoorMissingRequiredArtifactCount"] = len(missing)
    manifest["audioHumanListenDecisionFrontDoorLatestStatus"] = status
    manifest["audioHumanListenDecisionFrontDoorCount"] = len(history)
    manifest["audioHumanListenDecisionFrontDoorMissingRequiredArtifactCount"] = len(missing)
    manifest["humanListenDecisionFrontDoorMissionFocusWindowCount"] = review_runway["missionFocusWindowCount"]
    manifest["humanListenDecisionFrontDoorMissionReelItemCount"] = review_runway["missionReelItemCount"]
    manifest["humanListenDecisionFrontDoorSourceBalanceTriageWindowCount"] = review_runway["sourceBalanceTriageWindowCount"]
    manifest["humanListenDecisionFrontDoorSpeakerCleanupMustListenCount"] = review_runway["speakerCleanupMustListenCount"]
    manifest["humanListenDecisionFrontDoorSpeakerCleanupListenReelStatus"] = review_runway["speakerCleanupListenReelStatus"]
    manifest["humanListenDecisionFrontDoorSpeakerCleanupListenReelItemCount"] = review_runway["speakerCleanupListenReelItemCount"]
    manifest["humanListenDecisionFrontDoorSpeakerCleanupListenReelMissingSnippetCount"] = review_runway["speakerCleanupListenReelMissingSnippetCount"]
    manifest["humanListenDecisionFrontDoorSpeakerCleanupListenReelDurationSeconds"] = review_runway["speakerCleanupListenReelDurationSeconds"]
    manifest["humanListenDecisionFrontDoorAllSpeakersSurviveInMaster"] = review_runway["allSpeakersSurviveInMaster"]
    manifest["humanListenDecisionFrontDoorDefectAtlasStatus"] = review_runway["defectAtlasStatus"]
    manifest["humanListenDecisionFrontDoorDefectAtlasItemCount"] = review_runway["defectAtlasItemCount"]
    manifest["humanListenDecisionFrontDoorDefectAtlasHighSeverityCount"] = review_runway["defectAtlasHighSeverityCount"]
    manifest["humanListenDecisionFrontDoorDefectAtlasMissingEvidenceCount"] = review_runway["defectAtlasMissingEvidenceCount"]
    manifest["humanListenDecisionFrontDoorDefectAtlasNotesInboxStatus"] = review_runway["defectAtlasNotesInboxStatus"]
    manifest["humanListenDecisionFrontDoorDefectAtlasNotesInboxMatchingCandidateCount"] = review_runway["defectAtlasNotesInboxMatchingCandidateCount"]
    manifest["humanListenDecisionFrontDoorDefectAtlasNotesInboxRepairActionCount"] = review_runway["defectAtlasNotesInboxRepairActionCount"]
    manifest["humanListenDecisionFrontDoorDefectAtlasNotesInboxFocusedProofActionCount"] = review_runway["defectAtlasNotesInboxFocusedProofActionCount"]
    manifest["humanListenDecisionFrontDoorDefectAtlasNotesInboxPassContextCount"] = review_runway["defectAtlasNotesInboxPassContextCount"]
    manifest["humanListenDecisionFrontDoorDefectAtlasNotesInboxSmokePassed"] = review_runway["defectAtlasNotesInboxSmokePassed"]
    manifest["humanListenDecisionFrontDoorScopedV007PlanStatus"] = review_runway["scopedV007PlanStatus"]
    manifest["humanListenDecisionFrontDoorScopedV007PlanQueueStatus"] = review_runway["scopedV007PlanQueueStatus"]
    manifest["humanListenDecisionFrontDoorScopedV007PlanSourceWithNotesCandidateCount"] = review_runway["scopedV007PlanSourceWithNotesCandidateCount"]
    manifest["humanListenDecisionFrontDoorScopedV007PlanRepairActionCount"] = review_runway["scopedV007PlanRepairActionCount"]
    manifest["humanListenDecisionFrontDoorScopedV007PlanFocusedProofActionCount"] = review_runway["scopedV007PlanFocusedProofActionCount"]
    manifest["humanListenDecisionFrontDoorScopedV007PlanPassContextCount"] = review_runway["scopedV007PlanPassContextCount"]
    manifest["humanListenDecisionFrontDoorScopedV007PlanPlannedItemCount"] = review_runway["scopedV007PlanPlannedItemCount"]
    manifest["humanListenDecisionFrontDoorScopedV007PlanSmokePassed"] = review_runway["scopedV007PlanSmokePassed"]
    manifest["humanListenDecisionFrontDoorScopedV007PlanSmokeScenarioCount"] = review_runway["scopedV007PlanSmokeScenarioCount"]
    manifest["humanListenDecisionFrontDoorScopedV007PlanSmokeFailureCount"] = review_runway["scopedV007PlanSmokeFailureCount"]
    manifest["humanListenDecisionFrontDoorApprovalStateChanged"] = False
    manifest["humanListenDecisionFrontDoorBranchStateChanged"] = False
    manifest["humanListenDecisionFrontDoorRenderAttempted"] = False
    manifest["humanListenDecisionFrontDoorUploadAttempted"] = False
    manifest["humanListenDecisionFrontDoorPublicationAttempted"] = False
    manifest["humanListenDecisionFrontDoorOriginalMediaMutated"] = False
    manifest["humanListenDecisionRecordCommandPresent"] = True
    manifest["humanListenDecisionRecordCommandPath"] = str(stable_record_decision)
    manifest["audioHumanListenDecisionFrontDoorApprovalStateChanged"] = False
    manifest["audioHumanListenDecisionFrontDoorBranchStateChanged"] = False
    manifest["audioHumanListenDecisionFrontDoorRenderAttempted"] = False
    manifest["audioHumanListenDecisionFrontDoorUploadAttempted"] = False
    manifest["audioHumanListenDecisionFrontDoorPublicationAttempted"] = False
    manifest["audioHumanListenDecisionFrontDoorOriginalMediaMutated"] = False
    manifest["audioHumanListenDecisionRecordCommandPresent"] = True
    manifest["audioHumanListenDecisionRecordCommandPath"] = str(stable_record_decision)
    write_json(manifest_path, manifest)

    print(json.dumps({
        "json": str(stable_json),
        "markdown": str(stable_md),
        "html": str(stable_html),
        "openCommand": str(stable_open),
        "versionedJson": str(versioned_json),
        "status": status,
        "missingRequiredArtifactCount": len(missing),
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
