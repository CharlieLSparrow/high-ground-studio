#!/usr/bin/env python3
"""Plan scoped v007 audio repair candidates from the unified review queue.

This is deliberately a planner, not an executor. It consumes the current
post-review action queue and turns returned human notes into stage-owned v007
repair/proof candidate plans. If no human notes exist yet, it creates a calm
waiting surface instead of pretending there is work to render.

It does not approve audio, fail audio by itself, unlock branches, render media,
upload files, publish anything, or mutate original/source media.
"""

from __future__ import annotations

import argparse
import html
import json
import os
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPAIR_SEVERITIES = {"repair", "needs-repair", "fail", "failed"}
PROOF_SEVERITIES = {"proof", "needs-proof", "focused-proof", "needs-focused-proof", "more-proof"}


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    expanded = input_path.expanduser()
    if (expanded / "manifest.json").exists():
        return expanded.resolve()
    nested = expanded / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.resolve()
    raise FileNotFoundError(f"Could not find manifest.json under {input_path}")


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
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
        ):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def load_output_report(outputs: dict[str, Any], key: str) -> tuple[dict[str, Any], str | None]:
    path = output_path(outputs.get(key))
    if not path:
        return {}, None
    report_path = Path(path)
    if not report_path.exists() or report_path.suffix.lower() != ".json":
        return {}, path
    try:
        return read_json(report_path), path
    except json.JSONDecodeError:
        return {}, path


def int_value(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def number_value(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def e(value: Any) -> str:
    return html.escape(str(value))


def normalize(value: Any) -> str:
    return str(value or "").strip().lower()


def action_collection(queue: dict[str, Any], key: str) -> list[dict[str, Any]]:
    value = queue.get(key)
    if isinstance(value, list):
        return [dict(item) for item in value if isinstance(item, dict)]
    return []


def action_label(action: dict[str, Any], index: int) -> str:
    for key in ("label", "title", "itemId", "id", "momentLabel", "sourceLabel", "source"):
        value = action.get(key)
        if value not in (None, ""):
            return str(value)
    return f"review action {index}"


def action_timecode(action: dict[str, Any]) -> str:
    for key in ("timecode", "time", "startTimecode", "sequenceTimecode"):
        value = action.get(key)
        if value not in (None, ""):
            return str(value)
    seconds = number_value(action.get("sequenceStartSeconds"))
    if seconds is not None:
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = seconds % 60
        return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"
    return "unknown"


def stage_for_action(action: dict[str, Any]) -> str:
    blob = " ".join(
        normalize(action.get(key))
        for key in (
            "sourceLabel",
            "sourceRole",
            "sourceManifestKey",
            "actionType",
            "decision",
            "label",
            "reviewerNotes",
            "firstMove",
        )
    )
    if any(term in blob for term in ("source-balance", "balance", "contribution", "missing source")):
        return "source-balance"
    if any(term in blob for term in ("speaker cleanup", "speaker-cleanup", "overgate", "gate", "bleed", "echo")):
        return "speaker-cleanup"
    if any(term in blob for term in ("studio sound", "sound", "spectrogram", "peak", "noise floor")):
        return "studio-sound"
    if any(term in blob for term in ("smooth", "cadence", "pause", "transition")):
        return "smoothness-cadence"
    if any(term in blob for term in ("parameter", "sweep", "winner", "threshold")):
        return "parameter-sweep"
    if any(term in blob for term in ("marker", "editor")):
        return "editor-marker"
    if any(term in blob for term in ("defect atlas", "atlas", "defect")):
        return "defect-atlas"
    if any(term in blob for term in ("technical", "audition", "channel")):
        return "technical-audition"
    return "human-listen-review"


def build_plan_items(queue: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    repair_actions = action_collection(queue, "repairActions")
    focused_proof_actions = action_collection(queue, "focusedProofActions")
    pass_context_actions = action_collection(queue, "passContextActions")
    plan_items: list[dict[str, Any]] = []

    for index, action in enumerate([*repair_actions, *focused_proof_actions], start=1):
        severity = "repair" if index <= len(repair_actions) else "focused-proof"
        stage = stage_for_action(action)
        label = action_label(action, index)
        plan_id = safe_slug(f"v007-{stage}-{index}-{label}")[:110]
        plan_items.append(
            {
                "planId": plan_id,
                "candidateLabel": f"v007 scoped {stage} candidate",
                "ownerStage": stage,
                "severity": severity,
                "sourceLabel": action.get("sourceLabel"),
                "sourceRole": action.get("sourceRole"),
                "sourceReport": action.get("sourceReport"),
                "sourceNotesPacket": action.get("sourceNotesPacket"),
                "actionType": action.get("actionType"),
                "decision": action.get("decision"),
                "label": label,
                "timecode": action_timecode(action),
                "sequenceStartSeconds": action.get("sequenceStartSeconds"),
                "durationSeconds": action.get("durationSeconds"),
                "reviewerNotes": action.get("reviewerNotes") or action.get("notes") or "",
                "firstMove": action.get("firstMove") or "Open the owning notes inbox and repair/tuning console before changing audio.",
                "stageOwnedRepairPath": [
                    "Preserve v006 unchanged as the reviewed evidence baseline.",
                    "Create a timestamped proof-window candidate, not a full-spine rerender first.",
                    "Tune only the owning stage named here unless evidence proves a different stage owns the symptom.",
                    "Compare before/after proof snippets by ear and machine checks before any v007 promotion.",
                ],
                "proofBeforePromotion": [
                    "Proof snippet exists for the exact failing window.",
                    "Reviewer can A/B v006 versus the scoped candidate.",
                    "Manifest records no original/source media mutation.",
                    "Branch inheritance stays locked until a real human listen decision is recorded.",
                ],
                "doNotDo": action.get("doNotDo")
                or [
                    "Do not overwrite v006.",
                    "Do not mutate original media.",
                    "Do not run a whole-spine magic-box retune without scoped proof.",
                    "Do not unlock branch inheritance from this plan alone.",
                ],
            }
        )
    return plan_items, repair_actions, focused_proof_actions + pass_context_actions


def grouped_stage_summary(plan_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in plan_items:
        groups[str(item.get("ownerStage") or "unknown")].append(item)
    summary = []
    for stage, items in sorted(groups.items()):
        summary.append(
            {
                "ownerStage": stage,
                "itemCount": len(items),
                "repairCount": sum(1 for item in items if item.get("severity") == "repair"),
                "focusedProofCount": sum(1 for item in items if item.get("severity") == "focused-proof"),
                "planIds": [str(item.get("planId")) for item in items],
            }
        )
    return summary


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Scoped v007 Repair Candidate Plan: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This is a repair/proof planning surface only. It consumes the unified post-review action queue and prepares scoped v007 candidate paths when human notes exist. It does not approve audio, unlock branches, render media, upload, publish, or mutate original media.",
        "",
        "## Status",
        "",
        f"- Status: `{report['status']}`",
        f"- Queue status: `{report['queueStatus']}`",
        f"- Sources with notes: `{report['sourceWithNotesCandidateCount']}`",
        f"- Repair actions: `{report['repairActionCount']}`",
        f"- Focused-proof actions: `{report['focusedProofActionCount']}`",
        f"- Pass-context actions: `{report['passContextCount']}`",
        f"- Planned scoped candidates: `{report['plannedItemCount']}`",
        f"- Next safe action: {report['nextSafeAction']}",
        "",
        "## Stage summary",
        "",
        "| Stage | Items | Repairs | Focused proof | Plan IDs |",
        "|---|---:|---:|---:|---|",
    ]
    for row in report.get("stageSummary") or []:
        lines.append(
            f"| `{row['ownerStage']}` | `{row['itemCount']}` | `{row['repairCount']}` | `{row['focusedProofCount']}` | `{', '.join(row.get('planIds') or [])}` |"
        )
    if not report.get("stageSummary"):
        lines.append("| `waiting` | `0` | `0` | `0` | No human repair/proof notes are queued yet. |")
    lines.extend(["", "## Planned candidates", ""])
    if not report.get("planItems"):
        lines.append("No scoped v007 plan items exist yet because no repair or focused-proof notes have been returned. Keep v006 locked and send reviewers through the final-listen mission packet.")
    for item in report.get("planItems") or []:
        lines.extend(
            [
                f"### {item['candidateLabel']} - `{item['planId']}`",
                "",
                f"- Severity: `{item['severity']}`",
                f"- Stage: `{item['ownerStage']}`",
                f"- Source: `{item.get('sourceLabel') or 'unknown'}`",
                f"- Timecode: `{item['timecode']}`",
                f"- Label: {item['label']}",
                f"- First move: {item['firstMove']}",
                f"- Reviewer notes: {item.get('reviewerNotes') or 'none recorded'}",
                "",
                "Repair path:",
                *[f"- {step}" for step in item.get("stageOwnedRepairPath") or []],
                "",
                "Proof before promotion:",
                *[f"- {step}" for step in item.get("proofBeforePromotion") or []],
                "",
            ]
        )
    lines.extend(
        [
            "## Safety",
            "",
            f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
            f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
            f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
            f"- Branch render attempted: `{str(report['branchRenderAttempted']).lower()}`",
            f"- Upload attempted: `{str(report['uploadAttempted']).lower()}`",
            f"- Publication attempted: `{str(report['publicationAttempted']).lower()}`",
            f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        ]
    )
    return "\n".join(lines) + "\n"


def render_html(report: dict[str, Any]) -> str:
    stage_cards = []
    for row in report.get("stageSummary") or []:
        stage_cards.append(
            f"<article><span>{e(row['ownerStage'])}</span><strong>{row['itemCount']}</strong><p>{row['repairCount']} repair / {row['focusedProofCount']} proof</p></article>"
        )
    if not stage_cards:
        stage_cards.append("<article><span>waiting</span><strong>0</strong><p>No repair/proof notes yet.</p></article>")

    item_rows = []
    for item in report.get("planItems") or []:
        item_rows.append(
            "<tr>"
            f"<td>{e(item['ownerStage'])}</td>"
            f"<td>{e(item['severity'])}</td>"
            f"<td><strong>{e(item['label'])}</strong><br><small>{e(item.get('reviewerNotes') or 'no reviewer note text')}</small></td>"
            f"<td>{e(item['timecode'])}</td>"
            f"<td>{e(item['firstMove'])}</td>"
            "</tr>"
        )
    if not item_rows:
        item_rows.append("<tr><td colspan='5'>No queued repair/proof notes yet. v006 remains locked pending human listen.</td></tr>")

    return f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Scoped v007 Repair Candidate Plan</title>
<style>
:root {{ color-scheme: dark; --bg:#101713; --panel:#1a241d; --panel2:#243327; --ink:#f7ecd7; --muted:#b9ad95; --gold:#e7c84a; --moss:#79d28c; --clay:#d47754; --line:rgba(247,236,215,.14); }}
* {{ box-sizing:border-box; }}
body {{ margin:0; font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--ink); background:radial-gradient(circle at top left,#2c442d,var(--bg) 50%); }}
main {{ width:min(1300px,calc(100vw - 48px)); margin:34px auto 70px; }}
.hero,.panel,article {{ border:1px solid var(--line); background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(0,0,0,.14)),var(--panel); box-shadow:0 22px 70px rgba(0,0,0,.32); }}
.hero {{ border-radius:30px; padding:30px; }}
.eyebrow {{ color:var(--gold); letter-spacing:.18em; text-transform:uppercase; font-weight:900; font-size:12px; }}
h1 {{ font-size:clamp(38px,6vw,78px); line-height:.92; margin:10px 0 14px; max-width:980px; }}
p,small {{ color:var(--muted); }}
.pills,.grid {{ display:flex; flex-wrap:wrap; gap:10px; }}
.pill {{ border:1px solid var(--line); border-radius:999px; background:rgba(0,0,0,.22); padding:10px 14px; color:var(--muted); }}
.pill strong {{ color:var(--ink); }}
section {{ margin-top:24px; }}
.panel {{ border-radius:24px; padding:22px; overflow:auto; }}
article {{ min-width:180px; border-radius:22px; padding:18px; }}
article span {{ color:var(--gold); text-transform:uppercase; letter-spacing:.08em; font-size:12px; font-weight:900; }}
article strong {{ display:block; font-size:42px; margin-top:4px; }}
table {{ width:100%; border-collapse:collapse; }}
th,td {{ border-bottom:1px solid var(--line); padding:12px; text-align:left; vertical-align:top; }}
th {{ color:var(--gold); text-transform:uppercase; letter-spacing:.08em; font-size:12px; }}
.status-ready-for-scoped-v007-repair-planning {{ color:var(--clay); }}
.status-waiting-for-human-review-actions {{ color:var(--moss); }}
</style></head>
<body><main>
<section class="hero">
  <div class="eyebrow">Quipsly Audio Workbench</div>
  <h1>Scoped v007 Repair Candidate Plan</h1>
  <p>This board turns returned human notes into stage-owned repair candidates. No notes, no fake repairs. No rendering, no approval, no branch unlock.</p>
  <div class="pills">
    <div class="pill"><strong>Status</strong> <span class="status-{e(report['status'])}">{e(report['status'])}</span></div>
    <div class="pill"><strong>Repair</strong> {report['repairActionCount']}</div>
    <div class="pill"><strong>Proof</strong> {report['focusedProofActionCount']}</div>
    <div class="pill"><strong>Plans</strong> {report['plannedItemCount']}</div>
    <div class="pill"><strong>Approval</strong> {e(report['approvalStatus'])}</div>
  </div>
</section>
<section class="grid">{''.join(stage_cards)}</section>
<section class="panel">
  <h2>Candidate plan items</h2>
  <table><thead><tr><th>Stage</th><th>Severity</th><th>Issue</th><th>Time</th><th>First move</th></tr></thead><tbody>{''.join(item_rows)}</tbody></table>
</section>
<section class="panel">
  <h2>Next safe action</h2>
  <p>{e(report['nextSafeAction'])}</p>
  <p>Safety: approval changed {str(report['approvalStateChanged']).lower()}, branch changed {str(report['branchStateChanged']).lower()}, render attempted {str(report['renderAttempted']).lower()}, branch render attempted {str(report['branchRenderAttempted']).lower()}, upload attempted {str(report['uploadAttempted']).lower()}, publication attempted {str(report['publicationAttempted']).lower()}, original media mutated {str(report['originalMediaMutated']).lower()}.</p>
</section>
</main></body></html>
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


def next_safe_action(status: str, repair_count: int, proof_count: int) -> str:
    if status == "needs-post-review-action-queue":
        return "Regenerate the post-review action queue before planning v007 work. Do not repair from stale or missing notes."
    if repair_count:
        return "Open this plan with the repair/tuning console, create scoped proof-window candidates for the exact failed notes, and preserve v006 unchanged until human A/B proof exists."
    if proof_count:
        return "Create focused proof snippets for the uncertain notes first. Do not promote a v007 repair until the proof window identifies an audible problem."
    return "Send reviewers through the final-listen mission packet. When pass/proof/repair notes return, rerun the control plane to create scoped v007 plans."


def update_manifest(manifest_path: Path, report: dict[str, Any]) -> None:
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    entry = {
        "path": report["jsonPath"],
        "jsonPath": report["jsonPath"],
        "markdownPath": report["markdownPath"],
        "htmlPath": report["htmlPath"],
        "openCommand": report["openCommand"],
        "versionedPath": report["versionedJsonPath"],
        "versionedJsonPath": report["versionedJsonPath"],
        "versionedMarkdownPath": report["versionedMarkdownPath"],
        "versionedHtmlPath": report["versionedHtmlPath"],
        "versionedOpenCommand": report["versionedOpenCommand"],
        "generatedAt": report["generatedAt"],
        "schema": report["schema"],
        "status": report["status"],
        "repairActionCount": report["repairActionCount"],
        "focusedProofActionCount": report["focusedProofActionCount"],
        "passContextCount": report["passContextCount"],
        "plannedItemCount": report["plannedItemCount"],
        "sourceWithNotesCandidateCount": report["sourceWithNotesCandidateCount"],
        "queueStatus": report["queueStatus"],
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }
    outputs["latestAudioScopedV007RepairCandidatePlan"] = entry
    outputs["latestAudioScopedV007RepairCandidatePlanMarkdown"] = report["markdownPath"]
    outputs["latestAudioScopedV007RepairCandidatePlanHtml"] = report["htmlPath"]
    outputs["latestAudioScopedV007RepairCandidatePlanOpenCommand"] = report["openCommand"]
    outputs.setdefault("audioScopedV007RepairCandidatePlans", []).append(entry)
    manifest["audioScopedV007RepairCandidatePlanCount"] = len(outputs["audioScopedV007RepairCandidatePlans"])
    manifest["audioScopedV007RepairCandidatePlanLatestStatus"] = report["status"]
    manifest["audioScopedV007RepairCandidatePlanQueueStatus"] = report["queueStatus"]
    manifest["audioScopedV007RepairCandidatePlanRepairActionCount"] = report["repairActionCount"]
    manifest["audioScopedV007RepairCandidatePlanFocusedProofActionCount"] = report["focusedProofActionCount"]
    manifest["audioScopedV007RepairCandidatePlanPassContextCount"] = report["passContextCount"]
    manifest["audioScopedV007RepairCandidatePlanPlannedItemCount"] = report["plannedItemCount"]
    manifest["audioScopedV007RepairCandidatePlanSourceWithNotesCandidateCount"] = report["sourceWithNotesCandidateCount"]
    manifest["audioScopedV007RepairCandidatePlanApprovalStateChanged"] = False
    manifest["audioScopedV007RepairCandidatePlanBranchStateChanged"] = False
    manifest["audioScopedV007RepairCandidatePlanRenderAttempted"] = False
    manifest["audioScopedV007RepairCandidatePlanBranchRenderAttempted"] = False
    manifest["audioScopedV007RepairCandidatePlanUploadAttempted"] = False
    manifest["audioScopedV007RepairCandidatePlanPublicationAttempted"] = False
    manifest["audioScopedV007RepairCandidatePlanOriginalMediaMutated"] = False
    write_json(manifest_path, manifest)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.get("outputs") or {}
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    generated_iso = datetime.now(timezone.utc).isoformat()

    queue, queue_path = load_output_report(outputs, "latestAudioPostReviewActionQueue")
    queue_status = str(queue.get("status") or "missing") if queue else "missing"
    repair_actions = action_collection(queue, "repairActions") if queue else []
    focused_proof_actions = action_collection(queue, "focusedProofActions") if queue else []
    pass_context_actions = action_collection(queue, "passContextActions") if queue else []
    plan_items, _, _ = build_plan_items(queue) if queue else ([], [], [])
    stage_summary = grouped_stage_summary(plan_items)

    if not queue:
        status = "needs-post-review-action-queue"
    elif plan_items:
        status = "ready-for-scoped-v007-repair-planning"
    else:
        status = "waiting-for-human-review-actions"

    stable_json = baseline_dir / "AUDIO_SCOPED_V007_REPAIR_CANDIDATE_PLAN.json"
    stable_md = baseline_dir / "AUDIO_SCOPED_V007_REPAIR_CANDIDATE_PLAN.md"
    stable_html = baseline_dir / "AUDIO_SCOPED_V007_REPAIR_CANDIDATE_PLAN.html"
    stable_open = baseline_dir / "OPEN_AUDIO_SCOPED_V007_REPAIR_CANDIDATE_PLAN.command"
    versioned_dir = baseline_dir / f"audio-scoped-v007-repair-candidate-plan-{slug}-{generated_at}"
    versioned_dir.mkdir(parents=True, exist_ok=True)
    versioned_json = versioned_dir / "scoped-v007-repair-candidate-plan.json"
    versioned_md = versioned_dir / "scoped-v007-repair-candidate-plan.md"
    versioned_html = versioned_dir / "scoped-v007-repair-candidate-plan.html"
    versioned_open = versioned_dir / "open-scoped-v007-repair-candidate-plan.command"

    report = {
        "schema": "quipsly.audio-workbench.scoped-v007-repair-candidate-planner.v1",
        "generatedAt": generated_at,
        "generatedIso": generated_iso,
        "status": status,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "queueReportPath": queue_path,
        "queueStatus": queue_status,
        "sourceCount": int_value(queue.get("sourceCount")) if queue else 0,
        "sourceWithNotesCandidateCount": int_value(queue.get("sourceWithNotesCandidateCount")) if queue else 0,
        "repairActionCount": len(repair_actions),
        "focusedProofActionCount": len(focused_proof_actions),
        "passContextCount": len(pass_context_actions),
        "plannedItemCount": len(plan_items),
        "stageCount": len(stage_summary),
        "stageSummary": stage_summary,
        "planItems": plan_items,
        "nextSafeAction": next_safe_action(status, len(repair_actions), len(focused_proof_actions)),
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
        "jsonPath": str(stable_json),
        "markdownPath": str(stable_md),
        "htmlPath": str(stable_html),
        "openCommand": str(stable_open),
        "versionedJsonPath": str(versioned_json),
        "versionedMarkdownPath": str(versioned_md),
        "versionedHtmlPath": str(versioned_html),
        "versionedOpenCommand": str(versioned_open),
    }

    markdown = render_markdown(report)
    html_doc = render_html(report)
    write_json(stable_json, report)
    write_json(versioned_json, report)
    stable_md.write_text(markdown, encoding="utf-8")
    versioned_md.write_text(markdown, encoding="utf-8")
    stable_html.write_text(html_doc, encoding="utf-8")
    versioned_html.write_text(html_doc, encoding="utf-8")
    write_open_command(stable_open, stable_html, stable_md)
    write_open_command(versioned_open, versioned_html, versioned_md)
    update_manifest(manifest_path, report)

    print(json.dumps({"status": status, "plannedItemCount": len(plan_items), "json": str(stable_json), "html": str(stable_html)}, indent=2))


if __name__ == "__main__":
    main()
