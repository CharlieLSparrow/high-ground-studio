#!/usr/bin/env python3
"""Create a stable unresolved-requirement review workbench for an audio baseline.

This turns the goal audit's partial and locked requirements into a direct
review surface. It does not approve audio, fail audio, render branches, upload
files, publish, or mutate original media.
"""

from __future__ import annotations

import argparse
import html
import json
import os
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


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in (
            "path",
            "markdownPath",
            "htmlPath",
            "openCommand",
            "versionedPath",
            "versionedMarkdownPath",
            "versionedHtmlPath",
            "m4aPath",
            "playlistPath",
        ):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def load_output_report(outputs: dict[str, Any], key: str) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    if not path or not Path(path).exists() or Path(path).suffix.lower() != ".json":
        return {}
    try:
        return read_json(Path(path))
    except json.JSONDecodeError:
        return {}


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def e(value: Any) -> str:
    return html.escape(str(value))


def artifact_for_key(outputs: dict[str, Any], key: str) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    exists = bool(path and Path(path).exists())
    return {
        "key": key,
        "path": path,
        "exists": exists,
        "kind": Path(path).suffix.lower().lstrip(".") if path else "unknown",
    }


def artifact_keys_for_requirement(title: str, status: str) -> list[str]:
    lower = title.lower()
    shared_review_front_door = [
        "latestAudioProducerCommandCenterHtml",
        "latestAudioHumanApprovalPreflightHtml",
        "latestAudioGoalCompletionAuditMarkdown",
        "latestAudioPostReviewActionQueueMarkdown",
    ]
    if "speaker" in lower or "bleed" in lower:
        return [
            "latestSpeakerCleanupDecisionMatrixHtml",
            "latestSpeakerCleanupListenMapHtml",
            "latestSpeakerCleanupProofPackHtml",
            "latestAudioSpeakerPreservationProofPackHtml",
            "latestAudioSpeakerPreservationProofNotesInboxMarkdown",
            "latestAudioSpeakerContributionLedgerHtml",
            *shared_review_front_door,
        ]
    if "edit branches" in lower or "inherit" in lower:
        return [
            "latestBranchInheritanceGateMarkdown",
            "latestHumanListenDecisionRehearsalMarkdown",
            "latestAudioReviewGateAuditMarkdown",
            *shared_review_front_door,
        ]
    if "long-form render" in lower or "render" in lower:
        return [
            "branchRenderPreflightMarkdown",
            "latestBranchRenderProofMarkdown",
            "latestApprovedBranchRenderExecutorMarkdown",
            "latestAudioReviewGateAuditMarkdown",
            *shared_review_front_door,
        ]
    if "dxrevive" in lower or "restoration" in lower:
        return [
            "latestDxReviveManualBouncePacketMarkdown",
            "latestDxReviveReturnWorkbenchHtml",
            "latestDxReviveBounceValidationMarkdown",
            "latestDxReviveProofCandidatePlannerMarkdown",
            "latestDxReviveBounceValidatorSmokeMarkdown",
            *shared_review_front_door,
        ]
    if "reusable" in lower or "future noisy" in lower or "outdoor" in lower:
        return [
            "latestReusableAudioProductionProfileMarkdown",
            "latestReusableAudioProductionProfileSmokeMarkdown",
            "latestReusableAudioProfileIntakePacketMarkdown",
            "latestReusableAudioProfileIntakePacketOpenCommand",
            "latestReusableAudioProfileIntakePacketSmokeMarkdown",
            "latestAudioProductionDoctrineMarkdown",
            *shared_review_front_door,
        ]
    if "workflow" in lower or "pipeline" in lower:
        return [
            "latestAudioReviewStartHereMarkdown",
            "latestAudioProducerCommandCenterHtml",
            "latestAudioHumanApprovalPreflightHtml",
            "latestAudioProductionDoctrineHtml",
            "latestAudioTransformationLineageLedgerHtml",
            "latestAudioWorkbenchStageControlSurfaceHtml",
            "latestReviewHandoffIndexMarkdown",
            "latestAudioReviewGateAuditMarkdown",
            "latestAudioPostReviewActionQueueMarkdown",
        ]
    if status == "locked":
        return [
            "latestAudioHumanApprovalPreflightHtml",
            "latestAudioReviewGateAuditMarkdown",
            "latestAudioGoalCompletionAuditMarkdown",
            "latestAudioPostReviewActionQueueMarkdown",
        ]
    return shared_review_front_door


def action_hint(status: str, title: str) -> str:
    lower = title.lower()
    if status == "locked":
        return "Do not unlock this here. Record the required human listen decision first, then rerun the relevant gate."
    if "speaker" in lower or "bleed" in lower:
        return "Listen to the speaker-preservation and smoothness proof surfaces before deciding whether a scoped v007 repair is justified."
    if "dxrevive" in lower:
        return "Only use dxRevive if human listening proves restoration is needed; validate returned bounces before creating any proof candidate."
    if "reusable" in lower or "homer" in lower:
        return "Use this as a future-episode intake checklist, not as proof that every noisy episode is solved."
    if "pipeline" in lower or "workflow" in lower:
        return "Have a human or agent use the front door once, then improve the confusing part instead of adding hidden magic."
    return "Review the linked evidence, record notes, and route the smallest safe follow-up action."


def build_report(manifest: dict[str, Any], baseline_dir: Path, generated_at: str) -> dict[str, Any]:
    outputs = manifest.get("outputs") or {}
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    approval_status = str(manifest.get("approvalStatus") or "unknown")
    goal_audit = load_output_report(outputs, "latestAudioGoalCompletionAudit")
    requirements = goal_audit.get("requirements") or []

    unresolved: list[dict[str, Any]] = []
    for item in requirements:
        status = str(item.get("status") or "unknown")
        if status == "proved":
            continue
        artifact_keys = [str(value) for value in item.get("artifactKeys") or []]
        if not artifact_keys:
            artifact_keys = artifact_keys_for_requirement(str(item.get("title") or ""), status)
        artifacts = [artifact_for_key(outputs, key) for key in artifact_keys]
        present = [artifact for artifact in artifacts if artifact["exists"]]
        missing = [artifact for artifact in artifacts if not artifact["exists"]]
        title = str(item.get("title") or "Untitled requirement")
        unresolved.append(
            {
                "title": title,
                "status": status,
                "nextAction": str(item.get("nextAction") or "No next action recorded."),
                "actionHint": action_hint(status, title),
                "evidence": [str(value) for value in (item.get("evidence") or [])],
                "presentArtifactCount": len(present),
                "missingArtifactCount": len(missing),
                "artifacts": artifacts,
            }
        )

    unlocked_review_count = sum(1 for item in unresolved if item["status"] == "partial")
    locked_count = sum(1 for item in unresolved if item["status"] == "locked")
    missing_artifact_count = sum(item["missingArtifactCount"] for item in unresolved)

    return {
        "schema": "quipsly.audio-workbench.unresolved-requirement-review.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "status": "ready" if unresolved and missing_artifact_count == 0 else "needs-artifact-refresh",
        "approvalStatus": approval_status,
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "statusCounts": goal_audit.get("statusCounts") or {},
        "unresolvedRequirementCount": len(unresolved),
        "partialRequirementCount": unlocked_review_count,
        "lockedRequirementCount": locked_count,
        "missingArtifactCount": missing_artifact_count,
        "reviewStatus": "ready" if unresolved and missing_artifact_count == 0 else "needs-artifact-refresh",
        "unresolvedRequirements": unresolved,
        "nextSafeActions": [
            "Open Producer Command Center first for current candidate truth.",
            "Use this workbench to decide which partial item needs ears, notes, or a scoped proof action.",
            "Do not unlock locked items from this workbench; locked means human listen approval or branch gate proof is still required.",
            "If a partial item sounds bad, export notes and route them through the post-review action queue.",
        ],
        "safety": {
            "approvalStateChanged": False,
            "branchStateChanged": False,
            "renderAttempted": False,
            "uploadAttempted": False,
            "publicationAttempted": False,
            "originalMediaMutated": False,
        },
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Episode 4 Unresolved Requirement Review",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        "",
        "This workbench turns the goal audit's partial and locked items into direct review actions. It does not approve audio, render branches, upload, publish, or mutate original media.",
        "",
        "## Current truth",
        "",
        f"- Approval: `{report['approvalStatus']}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Unresolved requirements: `{report['unresolvedRequirementCount']}`",
        f"- Partial: `{report['partialRequirementCount']}`; locked: `{report['lockedRequirementCount']}`",
        f"- Missing linked artifacts: `{report['missingArtifactCount']}`",
        "",
        "## Next safe actions",
        "",
    ]
    for action in report["nextSafeActions"]:
        lines.append(f"- {action}")
    lines.extend(["", "## Review lanes", ""])
    for item in report["unresolvedRequirements"]:
        lines.append(f"### {item['title']}")
        lines.append("")
        lines.append(f"- Status: `{item['status']}`")
        lines.append(f"- Action hint: {item['actionHint']}")
        lines.append(f"- Next safe action: {item['nextAction']}")
        lines.append(f"- Artifacts: `{item['presentArtifactCount']}` present / `{item['missingArtifactCount']}` missing")
        if item["evidence"]:
            lines.append("- Evidence:")
            for evidence in item["evidence"][:6]:
                lines.append(f"  - {evidence}")
        lines.append("- Artifacts to open:")
        for artifact in item["artifacts"]:
            marker = "OK" if artifact["exists"] else "MISSING"
            lines.append(f"  - `{marker}` `{artifact['key']}`: `{artifact.get('path') or 'not registered'}`")
        lines.append("")
    lines.extend(
        [
            "## Guardrails",
            "",
            f"- Approval state changed: `{str(report['safety']['approvalStateChanged']).lower()}`",
            f"- Branch state changed: `{str(report['safety']['branchStateChanged']).lower()}`",
            f"- Render attempted: `{str(report['safety']['renderAttempted']).lower()}`",
            f"- Upload attempted: `{str(report['safety']['uploadAttempted']).lower()}`",
            f"- Publication attempted: `{str(report['safety']['publicationAttempted']).lower()}`",
            f"- Original media mutated: `{str(report['safety']['originalMediaMutated']).lower()}`",
            "",
        ]
    )
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    lane_html = []
    for item in report["unresolvedRequirements"]:
        artifact_items = []
        for artifact in item["artifacts"]:
            path = artifact.get("path")
            href = Path(path).as_uri() if path and artifact.get("exists") else "#"
            artifact_items.append(
                f"<li class=\"{'ok' if artifact['exists'] else 'missing'}\"><a href=\"{e(href)}\">{e(artifact['key'])}</a><small>{e(path or 'not registered')}</small></li>"
            )
        evidence = "".join(f"<li>{e(value)}</li>" for value in item["evidence"][:6])
        lane_html.append(
            f"""
            <article class=\"lane {e(item['status'])}\">
              <div class=\"status\">{e(item['status'])}</div>
              <h2>{e(item['title'])}</h2>
              <p class=\"hint\">{e(item['actionHint'])}</p>
              <p class=\"next\">{e(item['nextAction'])}</p>
              <p class=\"metric\">Artifacts: {item['presentArtifactCount']} present / {item['missingArtifactCount']} missing</p>
              <h3>Evidence</h3>
              <ul>{evidence}</ul>
              <h3>Artifacts</h3>
              <ul class=\"artifacts\">{''.join(artifact_items)}</ul>
            </article>
            """
        )
    actions = "".join(f"<li>{e(action)}</li>" for action in report["nextSafeActions"])
    return f"""<!doctype html>
<html lang=\"en\">
<head>
<meta charset=\"utf-8\" />
<title>Episode 4 Unresolved Requirement Review</title>
<style>
:root {{
  color-scheme: dark;
  --bg: #101712;
  --panel: #17231b;
  --panel2: #223326;
  --ink: #f5ead2;
  --muted: #b7ad97;
  --gold: #e7c24a;
  --moss: #75c78b;
  --clay: #cf7252;
  --cyan: #7dd8d2;
  --line: rgba(245,234,210,.14);
}}
* {{ box-sizing: border-box; }}
body {{ margin: 0; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: radial-gradient(circle at top left, #2b3e27, var(--bg) 42%); color: var(--ink); }}
main {{ width: min(1320px, calc(100vw - 48px)); margin: 32px auto 72px; }}
.hero {{ border: 1px solid var(--line); border-radius: 30px; padding: 30px; background: linear-gradient(135deg, rgba(117,199,139,.12), rgba(231,194,74,.1)), var(--panel); box-shadow: 0 28px 80px rgba(0,0,0,.34); }}
.eyebrow {{ color: var(--gold); letter-spacing: .2em; text-transform: uppercase; font-size: 12px; font-weight: 900; }}
h1 {{ font-size: clamp(36px, 5vw, 70px); line-height: .92; margin: 10px 0 14px; }}
.truth {{ display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }}
.pill {{ border: 1px solid var(--line); border-radius: 999px; padding: 10px 14px; background: rgba(0,0,0,.2); color: var(--muted); }}
.pill strong {{ color: var(--ink); }}
.actions {{ border: 1px solid var(--line); border-radius: 24px; padding: 20px; margin: 22px 0; background: rgba(0,0,0,.18); }}
.grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 16px; }}
.lane {{ border: 1px solid var(--line); border-radius: 24px; padding: 20px; background: linear-gradient(180deg, rgba(255,255,255,.035), rgba(0,0,0,.08)), var(--panel); }}
.lane.partial {{ border-color: rgba(231,194,74,.36); }}
.lane.locked {{ border-color: rgba(207,114,82,.38); }}
.status {{ display: inline-flex; border-radius: 999px; padding: 6px 10px; background: rgba(231,194,74,.14); color: var(--gold); text-transform: uppercase; letter-spacing: .1em; font-size: 12px; font-weight: 900; }}
.hint {{ color: var(--cyan); font-weight: 800; }}
.next {{ border-left: 3px solid var(--gold); padding-left: 12px; }}
.metric {{ color: var(--moss); font-weight: 900; }}
li {{ margin: 8px 0; }}
.artifacts {{ list-style: none; padding: 0; }}
.artifacts li {{ border: 1px solid var(--line); border-radius: 14px; padding: 10px; background: var(--panel2); }}
.artifacts li.missing {{ background: rgba(207,114,82,.1); }}
.artifacts a {{ color: var(--ink); font-weight: 900; text-decoration: none; display: block; }}
.artifacts small {{ color: var(--muted); overflow-wrap: anywhere; }}
footer {{ color: var(--muted); margin-top: 28px; }}
</style>
</head>
<body>
<main>
  <section class=\"hero\">
    <div class=\"eyebrow\">Quipsly Audio Workbench</div>
    <h1>Unresolved Requirement Review</h1>
    <p>This is the honest edge of the Episode 4 v006 audio goal: what still needs ears, notes, returned bounces, another messy episode, or explicit approval before Quipsly moves downstream.</p>
    <div class=\"truth\">
      <div class=\"pill\"><strong>Approval</strong> {e(report['approvalStatus'])}</div>
      <div class=\"pill\"><strong>Human listen package</strong> {str(report['packageReadyForHumanListen']).lower()}</div>
      <div class=\"pill\"><strong>Partial</strong> {report['partialRequirementCount']}</div>
      <div class=\"pill\"><strong>Locked</strong> {report['lockedRequirementCount']}</div>
      <div class=\"pill\"><strong>Missing artifacts</strong> {report['missingArtifactCount']}</div>
    </div>
  </section>
  <section class=\"actions\">
    <h2>Next safe actions</h2>
    <ol>{actions}</ol>
  </section>
  <section class=\"grid\">{''.join(lane_html)}</section>
  <footer>Generated {e(report['generatedAt'])}. Original media mutated: false.</footer>
</main>
</body>
</html>
"""


def write_open_command(path: Path, html_path: Path, markdown_path: Path) -> None:
    path.write_text(
        "\n".join(["#!/bin/zsh", "set -euo pipefail", f"open {shell_quote(str(html_path))}", f"open {shell_quote(str(markdown_path))}"]) + "\n",
        encoding="utf-8",
    )
    os.chmod(path, 0o755)


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
    output_dir = baseline_dir / f"audio-unresolved-requirement-review-{slug}-{generated_at}"
    output_dir.mkdir(parents=True, exist_ok=True)

    versioned_json = output_dir / "unresolved-requirement-review.json"
    versioned_md = output_dir / "unresolved-requirement-review.md"
    versioned_html = output_dir / "unresolved-requirement-review.html"
    versioned_open = output_dir / "open-unresolved-requirement-review.command"
    stable_json = baseline_dir / "UNRESOLVED_REQUIREMENT_REVIEW.json"
    stable_md = baseline_dir / "UNRESOLVED_REQUIREMENT_REVIEW.md"
    stable_html = baseline_dir / "UNRESOLVED_REQUIREMENT_REVIEW.html"
    stable_open = baseline_dir / "OPEN_UNRESOLVED_REQUIREMENT_REVIEW.command"

    report = build_report(manifest_before, baseline_dir, generated_at)
    markdown = render_markdown(report)
    html_doc = render_html(report)
    write_json(versioned_json, report)
    versioned_md.write_text(markdown, encoding="utf-8")
    versioned_html.write_text(html_doc, encoding="utf-8")
    write_open_command(versioned_open, versioned_html, versioned_md)
    write_json(stable_json, report)
    stable_md.write_text(markdown, encoding="utf-8")
    stable_html.write_text(html_doc, encoding="utf-8")
    write_open_command(stable_open, stable_html, stable_md)

    manifest_after = read_json(manifest_path)
    outputs = manifest_after.setdefault("outputs", {})
    entry = {
        "path": str(stable_json),
        "markdownPath": str(stable_md),
        "htmlPath": str(stable_html),
        "openCommand": str(stable_open),
        "versionedPath": str(versioned_json),
        "versionedMarkdownPath": str(versioned_md),
        "versionedHtmlPath": str(versioned_html),
        "versionedOpenCommand": str(versioned_open),
        "generatedAt": generated_at,
        "schema": report["schema"],
        "status": report["reviewStatus"],
        "unresolvedRequirementCount": report["unresolvedRequirementCount"],
        "partialRequirementCount": report["partialRequirementCount"],
        "lockedRequirementCount": report["lockedRequirementCount"],
        "missingArtifactCount": report["missingArtifactCount"],
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }
    history = outputs.setdefault("audioUnresolvedRequirementReviews", [])
    history.append(entry)
    outputs["latestAudioUnresolvedRequirementReview"] = entry
    outputs["latestAudioUnresolvedRequirementReviewMarkdown"] = str(stable_md)
    outputs["latestAudioUnresolvedRequirementReviewHtml"] = str(stable_html)
    outputs["latestAudioUnresolvedRequirementReviewOpenCommand"] = str(stable_open)
    outputs["latestAudioUnresolvedRequirementReviewVersionedJson"] = str(versioned_json)
    outputs["latestAudioUnresolvedRequirementReviewVersionedMarkdown"] = str(versioned_md)
    outputs["latestAudioUnresolvedRequirementReviewVersionedHtml"] = str(versioned_html)
    outputs["latestAudioUnresolvedRequirementReviewVersionedOpenCommand"] = str(versioned_open)
    manifest_after["audioUnresolvedRequirementReviewCount"] = len(history)
    manifest_after["audioUnresolvedRequirementReviewLatestStatus"] = report["reviewStatus"]
    manifest_after["audioUnresolvedRequirementReviewUnresolvedCount"] = report["unresolvedRequirementCount"]
    manifest_after["audioUnresolvedRequirementReviewPartialCount"] = report["partialRequirementCount"]
    manifest_after["audioUnresolvedRequirementReviewLockedCount"] = report["lockedRequirementCount"]
    manifest_after["audioUnresolvedRequirementReviewMissingArtifactCount"] = report["missingArtifactCount"]
    manifest_after["audioUnresolvedRequirementReviewLatestGeneratedAt"] = generated_at
    manifest_after["audioUnresolvedRequirementReviewLatestMarkdown"] = str(stable_md)
    manifest_after["audioUnresolvedRequirementReviewOriginalMediaMutated"] = False
    manifest_after["audioUnresolvedRequirementReviewApprovalStateChanged"] = False
    manifest_after["audioUnresolvedRequirementReviewBranchStateChanged"] = False
    write_json(manifest_path, manifest_after)
    print(json.dumps(entry, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
