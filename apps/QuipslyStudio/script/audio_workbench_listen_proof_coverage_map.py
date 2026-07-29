#!/usr/bin/env python3
"""Create a stable human-listen proof coverage map for an audio baseline.

The runway can say the package is ready for human listen, but the reviewer still
needs to know what evidence counts. This report maps the remaining partial and
locked goal-audit requirements to the shortest defensible listen/proof surfaces.
It is readback and review guidance only: no approval, render, upload, publish,
branch unlock, or source-media mutation.
"""

from __future__ import annotations

import argparse
import html
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_BASELINE_DIR = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/"
    "20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/"
    "conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310"
)


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    path = input_path.expanduser().resolve()
    if (path / "manifest.json").exists():
        return path
    nested = path / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.resolve()
    raise FileNotFoundError(f"Could not find manifest.json under {input_path}")


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def first_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, list):
        for item in reversed(value):
            path = first_path(item)
            if path:
                return path
    if isinstance(value, dict):
        for key in (
            "path",
            "jsonPath",
            "markdownPath",
            "htmlPath",
            "openCommand",
            "versionedPath",
            "versionedJsonPath",
            "versionedMarkdownPath",
            "versionedHtmlPath",
            "versionedOpenCommand",
            "m4aPath",
            "wavPath",
            "playlistPath",
        ):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def output_path(value: Any) -> str | None:
    return first_path(value)


def count_value(value: Any) -> int:
    try:
        if value is None:
            return 0
        return int(value)
    except (TypeError, ValueError):
        return 0


def load_json_path(path: str | None) -> dict[str, Any]:
    if not path:
        return {}
    candidate = Path(path)
    if not candidate.exists() or candidate.suffix.lower() != ".json":
        return {}
    try:
        return read_json(candidate)
    except json.JSONDecodeError:
        return {}


def load_output_report(outputs: dict[str, Any], keys: str | list[str], fallback: Path | None = None) -> dict[str, Any]:
    key_list = [keys] if isinstance(keys, str) else keys
    for key in key_list:
        report = load_json_path(output_path(outputs.get(key)))
        if report:
            return report
    if fallback and fallback.exists():
        try:
            return read_json(fallback)
        except json.JSONDecodeError:
            return {}
    return {}


def artifact(outputs: dict[str, Any], key: str, label: str, purpose: str) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    exists = bool(path and Path(path).exists())
    size = Path(path).stat().st_size if exists else 0
    return {
        "key": key,
        "label": label,
        "purpose": purpose,
        "path": path,
        "exists": exists,
        "nonzero": bool(size > 0),
        "sizeBytes": size,
    }


def artifact_keys_for_requirement(title: str) -> list[tuple[str, str, str]]:
    lower = title.lower()
    if "speaker" in lower or "bleed" in lower:
        return [
            ("latestSpeakerCleanupDecisionMatrixHtml", "Speaker Cleanup Decision Matrix", "Judge each cleanup window with A/B snippets, pass/fail bars, and safe repair routes."),
            ("latestAudioSpeakerPreservationProofPackHtml", "Speaker Preservation Proof Pack", "Check that Charlie/Homer reactions, overlap, and naturalness survived cleanup."),
            ("latestAudioSmoothnessProofPackHtml", "Smoothness Proof Pack", "Listen for gate snap, unnatural dead air, and bad cadence around high-risk transitions."),
            ("latestAudioSpeakerContributionLedgerHtml", "Speaker Contribution Ledger", "See where each speaker/source is retained, suppressed, or suspicious."),
        ]
    if "edit branches" in lower or "inherit" in lower:
        return [
            ("latestAudioHumanApprovalPreflightHtml", "Human Approval Preflight", "Confirm the package is ready for real listen notes and branch locks remain honest."),
            ("latestBranchInheritanceGateMarkdown", "Branch Inheritance Gate", "Keep edit branches locked until real human listen approval is recorded."),
            ("latestPostListenOutcomeRouterMarkdown", "Post-listen Outcome Router", "Route pass, repair, or proof-needed outcomes after notes are processed."),
            ("latestAudioRunwayStateHtml", "Audio Runway State", "Verify current approval/gate/branch state before touching branch truth."),
        ]
    if "long-form render" in lower or "render" in lower:
        return [
            ("branchRenderPreflightMarkdown", "Branch Render Preflight", "Prepare long-form branch renders only after approval/inheritance gates pass."),
            ("latestApprovedBranchRenderExecutorMarkdown", "Approved Branch Render Executor", "Expose render commands only after human-approved branch readiness."),
            ("latestBranchRenderProofMarkdown", "Branch Render Proof Evidence", "Inspect proof-only render evidence without mistaking it for production approval."),
        ]
    if "dxrevive" in lower or "restoration" in lower:
        return [
            ("latestDxReviveReturnWorkbenchHtml", "dxRevive Return Workbench", "Track expected bounces, returned files, validation, and planner status in one place."),
            ("latestDxReviveManualBouncePacketMarkdown", "dxRevive Manual Bounce Packet", "Export/import derived treatment stems without touching source media."),
            ("latestDxReviveBounceValidationMarkdown", "dxRevive Bounce Validation", "Validate duration, sample rate, channel count, and file presence before use."),
            ("latestDxReviveProofCandidatePlannerMarkdown", "dxRevive Proof Candidate Planner", "Only create proof candidates after returned bounces validate."),
        ]
    if "reusable" in lower or "future" in lower or "outdoor" in lower:
        return [
            ("latestReusableAudioProfileIntakePacketMarkdown", "Reusable Profile Intake Packet", "Start the next noisy/outdoor episode with explicit source, sync, and proof-window expectations."),
            ("stableReusableAudioProductionProfileMarkdown", "Reusable Audio Production Profile", "Carry the Episode 4 pattern forward as a starting point, not a production-default claim."),
            ("latestReusableAudioProductionProfileSmokeMarkdown", "Reusable Profile Smoke", "Check that the reusable profile still works on synthetic fixtures."),
            ("latestAudioProductionDoctrineHtml", "Audio Production Doctrine", "Use the doctrine as the operating manual for future messy recordings."),
        ]
    return [
        ("latestAudioProducerCommandCenterHtml", "Producer Command Center", "Start from the calm front door and the next safest action."),
        ("latestAudioRunwayStateHtml", "Audio Runway State", "Confirm gate, handoff, unresolved requirements, and branch locks."),
        ("latestAudioFinalListenFastPassHtml", "Final-listen Fast Pass", "Use the shortest sane listen route before approving, repairing, or requesting proof."),
        ("latestAudioPostReviewActionQueueMarkdown", "Post-review Action Queue", "Make sure exported notes land as repair/proof/pass actions."),
    ]


def step_artifacts(outputs: dict[str, Any], keys: list[tuple[str, str, str]]) -> list[dict[str, Any]]:
    return [artifact(outputs, key, label, purpose) for key, label, purpose in keys]


def goal_requirements(goal_audit: dict[str, Any]) -> list[dict[str, Any]]:
    requirements = goal_audit.get("requirements") if isinstance(goal_audit.get("requirements"), list) else []
    out = []
    for item in requirements:
        if not isinstance(item, dict):
            continue
        status = str(item.get("status") or "unknown")
        if status == "proved":
            continue
        out.append(item)
    return out


def build_report(manifest: dict[str, Any], baseline_dir: Path, generated_at: str) -> dict[str, Any]:
    outputs = manifest.get("outputs") or {}
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    approval_status = str(manifest.get("approvalStatus") or "unknown")
    goal_audit = load_output_report(outputs, "latestAudioGoalCompletionAudit", baseline_dir / "AUDIO_GOAL_COMPLETION_AUDIT.json")
    runway = load_output_report(outputs, "latestAudioRunwayState", baseline_dir / "AUDIO_RUNWAY_STATE.json")
    preflight = load_output_report(outputs, "latestAudioHumanApprovalPreflight", baseline_dir / "HUMAN_APPROVAL_PREFLIGHT.json")
    post_queue = load_output_report(outputs, "latestAudioPostReviewActionQueue", baseline_dir / "AUDIO_POST_REVIEW_ACTION_QUEUE.json")

    minimum_path = [
        {
            "step": "Start at current truth",
            "why": "Make sure approval, branch, gate, and unresolved state are current before listening.",
            "artifacts": step_artifacts(
                outputs,
                [
                    ("latestAudioProducerCommandCenterHtml", "Producer Command Center", "Human-friendly current-state front door."),
                    ("latestAudioRunwayStateHtml", "Audio Runway State", "Machine-readable/readable current-state rollup."),
                    ("latestAudioUnresolvedRequirementReviewHtml", "Unresolved Requirement Review", "Partial/locked work mapped to real evidence."),
                ],
            ),
        },
        {
            "step": "Listen the shortest full-candidate route",
            "why": "Hear enough of the current master to decide if v006 can advance or needs focused repair.",
            "artifacts": step_artifacts(
                outputs,
                [
                    ("latestAudioFinalListenFastPassHtml", "Final-listen Fast Pass", "Single master player plus ranked jumps and note export."),
                    ("latestAudioTechnicalAuditionSnippetPackHtml", "Technical Audition Snippet Pack", "Playable technical audition sections."),
                    ("latestAudioSmoothnessProofPackHtml", "Smoothness Proof Pack", "Transitions and long low-level spans."),
                ],
            ),
        },
        {
            "step": "Check speaker cleanup and preservation",
            "why": "Prove Charlie/Homer are preserved and wrong-mic noise is suppressed without sounding chopped.",
            "artifacts": step_artifacts(
                outputs,
                [
                    ("latestSpeakerCleanupDecisionMatrixHtml", "Speaker Cleanup Decision Matrix", "Cleanup A/B proof plus safe action routing."),
                    ("latestAudioSpeakerPreservationProofPackHtml", "Speaker Preservation Proof Pack", "Source-vs-master preservation checks."),
                    ("latestAudioSpeakerContributionLedgerHtml", "Speaker Contribution Ledger", "Full-length speaker/source X-ray."),
                ],
            ),
        },
        {
            "step": "Export and route notes",
            "why": "Turn human listening into structured pass, repair, or proof-needed actions without changing approval truth by accident.",
            "artifacts": step_artifacts(
                outputs,
                [
                    ("latestAudioPostReviewActionQueueMarkdown", "Post-review Action Queue", "Unified queue after all note inboxes run."),
                    ("latestAudioPostHumanListenNotesRoundtripCommand", "Process Review Notes Command", "Reruns inboxes, queue, gate, START_HERE, and handoff."),
                    ("latestAudioHumanApprovalPreflightHtml", "Human Approval Preflight", "Final go/no-go before a real decision route."),
                ],
            ),
        },
    ]

    requirement_coverage = []
    missing_artifacts = 0
    for item in goal_requirements(goal_audit):
        title = str(item.get("title") or "Untitled requirement")
        status = str(item.get("status") or "unknown")
        artifacts = step_artifacts(outputs, artifact_keys_for_requirement(title))
        missing = [entry for entry in artifacts if not (entry["exists"] and entry["nonzero"])]
        missing_artifacts += len(missing)
        requirement_coverage.append(
            {
                "title": title,
                "status": status,
                "nextAction": str(item.get("nextAction") or "Review the linked evidence and route the smallest safe follow-up action."),
                "evidence": [str(value) for value in (item.get("evidence") or [])],
                "artifacts": artifacts,
                "missingArtifactCount": len(missing),
            }
        )

    for step in minimum_path:
        missing_artifacts += sum(1 for item in step["artifacts"] if not (item["exists"] and item["nonzero"]))

    ready_for_listen = bool(runway.get("readyForHumanDecision") or preflight.get("readyForHumanDecision"))
    post_actions = count_value(post_queue.get("repairActionCount")) + count_value(post_queue.get("focusedProofActionCount")) + count_value(post_queue.get("passContextCount"))
    if missing_artifacts:
        status = "needs-artifact-repair-before-listen-proof"
        next_safe_action = "Repair missing listen-proof coverage artifacts, then regenerate this map before asking for human approval."
    elif post_actions:
        status = "notes-present-review-action-queue"
        next_safe_action = "Open the post-review action queue, handle repair/proof/pass actions, and do not unlock branches until explicit approval is recorded."
    elif ready_for_listen:
        status = "ready-for-human-listen-proof"
        next_safe_action = "Follow the minimum listen path, export notes, run the review-notes command, then use the guarded human approval/failure route."
    else:
        status = "blocked-before-human-listen-proof"
        next_safe_action = "Open the runway state and human approval preflight; fix blockers before routing listen proof."

    return {
        "schema": "quipsly.audio-workbench.listen-proof-coverage-map.v1",
        "status": status,
        "coverageStatus": status,
        "generatedAt": generated_at,
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "approvalStatus": approval_status,
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "readyForHumanListenProof": ready_for_listen,
        "minimumPath": minimum_path,
        "minimumPathStepCount": len(minimum_path),
        "requirementCoverage": requirement_coverage,
        "requirementCoverageCount": len(requirement_coverage),
        "partialRequirementCoverageCount": sum(1 for item in requirement_coverage if item["status"] == "partial"),
        "lockedRequirementCoverageCount": sum(1 for item in requirement_coverage if item["status"] == "locked"),
        "missingArtifactCount": missing_artifacts,
        "postReviewActionCount": post_actions,
        "nextSafeAction": next_safe_action,
        "safety": {
            "approvesAudio": False,
            "failsAudio": False,
            "unlocksBranches": False,
            "rendersBranches": False,
            "uploadsFiles": False,
            "publishesExternally": False,
            "mutatesOriginalMedia": False,
            "changesApprovalState": False,
            "changesBranchState": False,
        },
    }


def md_path(path: str | None) -> str:
    return f"`{path}`" if path else "`missing`"


def link(path: str | None, label: str) -> str:
    if not path:
        return html.escape(label) + " (missing)"
    return f"<a href=\"file://{html.escape(path)}\">{html.escape(label)}</a>"


def build_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Episode 4 Human Listen Proof Coverage Map",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This is a reviewer coverage map. It does not approve audio, fail audio, unlock branches, render, upload, publish, or mutate source media.",
        "",
        "## Current state",
        "",
        f"- Status: `{report['status']}`",
        f"- Baseline: `{report['baselineId']}`",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Coverage missing artifacts: `{report['missingArtifactCount']}`",
        "",
        "## Next safest action",
        "",
        report["nextSafeAction"],
        "",
        "## Minimum sufficient listen path",
        "",
    ]
    for index, step in enumerate(report["minimumPath"], start=1):
        lines.extend([f"### {index}. {step['step']}", "", step["why"], ""])
        for item in step["artifacts"]:
            status = "ok" if item["exists"] and item["nonzero"] else "missing"
            lines.append(f"- `{status}` {item['label']}: {md_path(item['path'])} — {item['purpose']}")
        lines.append("")
    lines.extend(["## Coverage by remaining requirement", ""])
    for item in report["requirementCoverage"]:
        lines.extend([f"### {item['status']}: {item['title']}", "", f"Next action: {item['nextAction']}", ""])
        for artifact_item in item["artifacts"]:
            status = "ok" if artifact_item["exists"] and artifact_item["nonzero"] else "missing"
            lines.append(f"- `{status}` {artifact_item['label']}: {md_path(artifact_item['path'])} — {artifact_item['purpose']}")
        lines.append("")
    lines.extend(
        [
            "## Safety locks",
            "",
            "- Approves audio: `false`",
            "- Unlocks branches: `false`",
            "- Renders branches: `false`",
            "- Uploads files: `false`",
            "- Publishes externally: `false`",
            "- Mutates original media: `false`",
        ]
    )
    return "\n".join(lines) + "\n"


def build_html(report: dict[str, Any]) -> str:
    step_cards = []
    for index, step in enumerate(report["minimumPath"], start=1):
        rows = "".join(
            f"<li><span class=\"pill {'ok' if item['exists'] and item['nonzero'] else 'bad'}\">{'ok' if item['exists'] and item['nonzero'] else 'missing'}</span> {link(item['path'], item['label'])}<small>{html.escape(item['purpose'])}</small></li>"
            for item in step["artifacts"]
        )
        step_cards.append(f"<section class=\"card\"><h3>{index}. {html.escape(step['step'])}</h3><p>{html.escape(step['why'])}</p><ul>{rows}</ul></section>")
    req_cards = []
    for item in report["requirementCoverage"]:
        rows = "".join(
            f"<li><span class=\"pill {'ok' if artifact_item['exists'] and artifact_item['nonzero'] else 'bad'}\">{'ok' if artifact_item['exists'] and artifact_item['nonzero'] else 'missing'}</span> {link(artifact_item['path'], artifact_item['label'])}<small>{html.escape(artifact_item['purpose'])}</small></li>"
            for artifact_item in item["artifacts"]
        )
        req_cards.append(
            f"<section class=\"card\"><h3>{html.escape(item['status'])}: {html.escape(item['title'])}</h3><p><strong>Next:</strong> {html.escape(item['nextAction'])}</p><ul>{rows}</ul></section>"
        )
    status_class = "ok" if report["status"] == "ready-for-human-listen-proof" else "warn"
    return f"""<!doctype html>
<html lang=\"en\">
<head>
<meta charset=\"utf-8\" />
<title>Episode 4 Human Listen Proof Coverage</title>
<style>
:root {{ color-scheme: dark; --bg:#101711; --leaf:#1b2a20; --moss:#29412f; --ink:#f5eedf; --muted:#c6bda5; --gold:#ebc85d; --green:#70d98c; --red:#ff7b6e; }}
body {{ margin:0; padding:32px; background: radial-gradient(circle at 12% 0%, #244631, var(--bg) 52%); color:var(--ink); font:15px/1.55 -apple-system,BlinkMacSystemFont,\"Avenir Next\",sans-serif; }}
main {{ max-width:1180px; margin:auto; }}
h1 {{ font-size:40px; letter-spacing:-.035em; margin:.2em 0; }}
h2 {{ margin-top:34px; color:var(--gold); text-transform:uppercase; letter-spacing:.16em; font-size:14px; }}
h3 {{ margin:.2em 0 .4em; }}
.card {{ background: color-mix(in srgb, var(--leaf) 88%, black); border:1px solid rgba(235,200,93,.22); border-radius:22px; padding:20px; margin:14px 0; box-shadow:0 16px 50px rgba(0,0,0,.24); }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:14px; }}
ul {{ padding-left:0; list-style:none; }}
li {{ border-top:1px solid rgba(245,238,223,.1); padding:10px 0; }}
small {{ display:block; color:var(--muted); margin-left:52px; }}
a {{ color:#9fe0aa; text-decoration:none; }}
.badge,.pill {{ display:inline-flex; align-items:center; border-radius:999px; padding:6px 10px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; font-size:12px; margin-right:8px; }}
.ok {{ background:rgba(112,217,140,.15); color:var(--green); border:1px solid rgba(112,217,140,.3); }}
.warn {{ background:rgba(235,200,93,.15); color:var(--gold); border:1px solid rgba(235,200,93,.3); }}
.bad {{ background:rgba(255,123,110,.15); color:var(--red); border:1px solid rgba(255,123,110,.3); }}
.metric {{ background:var(--moss); border-radius:18px; padding:16px; }}
.metric strong {{ display:block; font-size:26px; }}
</style>
</head>
<body>
<main>
<p class=\"badge {status_class}\">{html.escape(report['status'])}</p>
<h1>Episode 4 Human Listen Proof Coverage</h1>
<p>This map tells a reviewer what evidence is enough to make a defensible pass, repair, or proof-needed decision. It is guidance only, not approval.</p>
<div class=\"grid\">
<div class=\"metric\"><span>Minimum path</span><strong>{report['minimumPathStepCount']}</strong><small>review stages</small></div>
<div class=\"metric\"><span>Remaining requirements</span><strong>{report['requirementCoverageCount']}</strong><small>{report['partialRequirementCoverageCount']} partial / {report['lockedRequirementCoverageCount']} locked</small></div>
<div class=\"metric\"><span>Missing artifacts</span><strong>{report['missingArtifactCount']}</strong><small>must be zero</small></div>
</div>
<section class=\"card\"><h2>Next safest action</h2><p>{html.escape(report['nextSafeAction'])}</p></section>
<h2>Minimum sufficient listen path</h2>
{''.join(step_cards)}
<h2>Coverage by remaining requirement</h2>
{''.join(req_cards)}
</main>
</body>
</html>
"""


def write_open_command(path: Path, html_path: Path, markdown_path: Path) -> None:
    path.write_text(
        "#!/bin/zsh\n"
        "set -euo pipefail\n"
        f"open {shell_quote(str(html_path))}\n"
        f"open {shell_quote(str(markdown_path))}\n",
        encoding="utf-8",
    )
    os.chmod(path, 0o755)


def main() -> None:
    parser = argparse.ArgumentParser(description="Create an audio human-listen proof coverage map.")
    parser.add_argument("--baseline-dir", type=Path, default=DEFAULT_BASELINE_DIR)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    generated_at = datetime.now(timezone.utc).isoformat()
    baseline_slug = safe_slug(str(manifest.get("baselineId") or baseline_dir.name))
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")

    output_dir = baseline_dir / f"listen-proof-coverage-map-{baseline_slug}-{timestamp}"
    output_dir.mkdir(parents=True, exist_ok=True)
    stable_json = baseline_dir / "LISTEN_PROOF_COVERAGE_MAP.json"
    stable_md = baseline_dir / "LISTEN_PROOF_COVERAGE_MAP.md"
    stable_html = baseline_dir / "LISTEN_PROOF_COVERAGE_MAP.html"
    stable_open_command = baseline_dir / "OPEN_LISTEN_PROOF_COVERAGE_MAP.command"
    output_json = output_dir / "LISTEN_PROOF_COVERAGE_MAP.json"
    output_md = output_dir / "LISTEN_PROOF_COVERAGE_MAP.md"
    output_html = output_dir / "LISTEN_PROOF_COVERAGE_MAP.html"
    output_open_command = output_dir / "OPEN_LISTEN_PROOF_COVERAGE_MAP.command"

    report = build_report(manifest, baseline_dir, generated_at)
    markdown = build_markdown(report)
    html_doc = build_html(report)
    for path in (stable_json, output_json):
        write_json(path, report)
    for path in (stable_md, output_md):
        path.write_text(markdown, encoding="utf-8")
    for path in (stable_html, output_html):
        path.write_text(html_doc, encoding="utf-8")
    write_open_command(stable_open_command, stable_html, stable_md)
    write_open_command(output_open_command, output_html, output_md)

    manifest_after = read_json(manifest_path)
    outputs = manifest_after.setdefault("outputs", {})
    entry = {
        "path": str(stable_json),
        "jsonPath": str(stable_json),
        "markdownPath": str(stable_md),
        "htmlPath": str(stable_html),
        "openCommand": str(stable_open_command),
        "versionedPath": str(output_json),
        "versionedJsonPath": str(output_json),
        "versionedMarkdownPath": str(output_md),
        "versionedHtmlPath": str(output_html),
        "versionedOpenCommand": str(output_open_command),
        "generatedAt": generated_at,
        "schema": report["schema"],
        "status": report["status"],
        "coverageStatus": report["coverageStatus"],
        "minimumPathStepCount": report["minimumPathStepCount"],
        "requirementCoverageCount": report["requirementCoverageCount"],
        "missingArtifactCount": report["missingArtifactCount"],
        "nextSafeAction": report["nextSafeAction"],
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }
    history = outputs.setdefault("audioListenProofCoverageMaps", [])
    history.append(entry)
    outputs["latestAudioListenProofCoverageMap"] = entry
    outputs["latestAudioListenProofCoverageMapJson"] = str(stable_json)
    outputs["latestAudioListenProofCoverageMapMarkdown"] = str(stable_md)
    outputs["latestAudioListenProofCoverageMapHtml"] = str(stable_html)
    outputs["latestAudioListenProofCoverageMapOpenCommand"] = str(stable_open_command)
    outputs["latestAudioListenProofCoverageMapVersionedJson"] = str(output_json)
    outputs["latestAudioListenProofCoverageMapVersionedMarkdown"] = str(output_md)
    outputs["latestAudioListenProofCoverageMapVersionedHtml"] = str(output_html)
    outputs["latestAudioListenProofCoverageMapVersionedOpenCommand"] = str(output_open_command)
    manifest_after["audioListenProofCoverageMapCount"] = len(history)
    manifest_after["audioListenProofCoverageMapLatestStatus"] = report["status"]
    manifest_after["audioListenProofCoverageMapMissingArtifactCount"] = report["missingArtifactCount"]
    manifest_after["audioListenProofCoverageMapRequirementCoverageCount"] = report["requirementCoverageCount"]
    manifest_after["audioListenProofCoverageMapApprovalStateChanged"] = False
    manifest_after["audioListenProofCoverageMapBranchStateChanged"] = False
    manifest_after["audioListenProofCoverageMapRenderAttempted"] = False
    manifest_after["audioListenProofCoverageMapUploadAttempted"] = False
    manifest_after["audioListenProofCoverageMapPublicationAttempted"] = False
    manifest_after["audioListenProofCoverageMapOriginalMediaMutated"] = False
    write_json(manifest_path, manifest_after)
    print(json.dumps(entry, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
