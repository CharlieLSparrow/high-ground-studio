#!/usr/bin/env python3
"""Aggregate audio review notes into one safe post-review action queue.

The individual inboxes are intentionally specialized: listen-priority notes,
speaker-cleanup notes, studio-sound notes, smoothness proof notes,
parameter-sweep notes, marker-review notes, and producer-grade notes each know
their own export contract. This script sits one level above them and answers the
production question: after every notes inbox has run, what needs repair, what
needs focused proof, what is pass/context, and what is still waiting on human
notes?

It does not approve audio, fail audio, render media, upload files, unlock
branches, or mutate original media.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class QueueSource:
    label: str
    manifest_key: str
    markdown_key: str
    role: str


SOURCES = [
    QueueSource(
        "Listen-priority / control-room notes",
        "latestAudioListenPriorityNotesInbox",
        "latestAudioListenPriorityNotesInboxMarkdown",
        "primary human listen queue",
    ),
    QueueSource(
        "Speaker cleanup listen-map notes",
        "latestSpeakerCleanupListenMapNotesInbox",
        "latestSpeakerCleanupListenMapNotesInboxMarkdown",
        "speaker gating / bleed cleanup proof",
    ),
    QueueSource(
        "Speaker preservation proof notes",
        "latestAudioSpeakerPreservationProofNotesInbox",
        "latestAudioSpeakerPreservationProofNotesInboxMarkdown",
        "source-vs-master speaker preservation proof",
    ),
    QueueSource(
        "Final listen fast-pass notes",
        "latestAudioFinalListenFastPassNotesInbox",
        "latestAudioFinalListenFastPassNotesInboxMarkdown",
        "compact final approval route",
    ),
    QueueSource(
        "Human listen Mission Reel notes",
        "latestAudioHumanListenMissionReelNotesInbox",
        "latestAudioHumanListenMissionReelNotesInboxMarkdown",
        "focused Mission Reel return packet for repair/proof/pass-context notes",
    ),
    QueueSource(
        "Smoothness proof notes",
        "latestAudioSmoothnessProofNotesInbox",
        "latestAudioSmoothnessProofNotesInboxMarkdown",
        "smoothness, cadence, gate-edge, and pause proof",
    ),
    QueueSource(
        "Technical audition notes",
        "latestAudioTechnicalAuditionNotesInbox",
        "latestAudioTechnicalAuditionNotesInboxMarkdown",
        "technical audition listen priorities and full-spine engineering checks",
    ),
    QueueSource(
        "Studio Sound notes",
        "latestAudioStudioSoundNotesInbox",
        "latestAudioStudioSoundNotesInboxMarkdown",
        "window-level studio sound repair/proof/pass notes",
    ),
    QueueSource(
        "Audio Defect Atlas notes",
        "latestAudioDefectAtlasNotesInbox",
        "latestAudioDefectAtlasNotesInboxMarkdown",
        "stage-aware defect-atlas pass/proof/repair notes",
    ),
    QueueSource(
        "Parameter sweep proof notes",
        "latestAudioWorkbenchParameterSweepNotesInbox",
        "latestAudioWorkbenchParameterSweepNotesInboxMarkdown",
        "A/B tuning proof choices",
    ),
    QueueSource(
        "Marker-review notes",
        "latestMarkerReviewNotesInbox",
        "latestMarkerReviewNotesInboxMarkdown",
        "editor marker jump checks",
    ),
    QueueSource(
        "Producer-grade audit notes",
        "latestAudioProducerGradeNotesInbox",
        "latestAudioProducerGradeNotesInboxMarkdown",
        "producer-quality jump checks",
    ),
    QueueSource(
        "Listen-notes repair planner",
        "latestAudioListenNotesRepairPlanner",
        "latestAudioListenNotesRepairPlannerMarkdown",
        "legacy repair planner for listen/marker notes",
    ),
]

REPAIR_DECISIONS = {"needs-repair", "repair", "fail", "failed"}
PROOF_DECISIONS = {"needs-proof", "more-proof", "needs-focused-proof"}
PASS_DECISIONS = {"pass", "ok", "acceptable", "approved-context", "winner"}


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


def normalize_decision(value: Any) -> str:
    return str(value or "").strip().lower()


def action_severity(action: dict[str, Any]) -> str:
    action_type = normalize_decision(action.get("actionType"))
    decision = normalize_decision(action.get("decision"))
    severity = normalize_decision(action.get("severity"))
    if decision in REPAIR_DECISIONS or "repair" in action_type or severity == "repair":
        return "repair"
    if decision in PROOF_DECISIONS or "proof" in action_type or severity == "proof":
        return "proof"
    if decision in PASS_DECISIONS or "pass" in action_type or severity == "pass":
        return "pass-context"
    return "context"


def action_label(action: dict[str, Any], fallback: str) -> str:
    for key in ["label", "title", "itemId", "id", "momentLabel", "source"]:
        value = action.get(key)
        if value not in (None, ""):
            return str(value)
    return fallback


def action_timecode(action: dict[str, Any]) -> str:
    for key in ["timecode", "time", "startTimecode", "sequenceTimecode"]:
        value = action.get(key)
        if value not in (None, ""):
            return str(value)
    seconds = action.get("sequenceStartSeconds")
    if isinstance(seconds, (int, float)):
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = seconds % 60
        return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"
    return "unknown"


def coerce_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def selected_candidate_path(report: dict[str, Any]) -> str | None:
    selected = report.get("selectedCandidate")
    if isinstance(selected, dict):
        path = selected.get("path")
        if isinstance(path, str) and path:
            return path
    return None


def extract_actions(source: QueueSource, report: dict[str, Any], report_path: Path) -> list[dict[str, Any]]:
    raw_actions: list[dict[str, Any]] = []
    for field in ["repairActions", "reviewActions", "focusedProofActions", "passContextActions"]:
        values = report.get(field)
        if isinstance(values, list):
            raw_actions.extend(dict(item) for item in values if isinstance(item, dict))

    actions: list[dict[str, Any]] = []
    for index, action in enumerate(raw_actions, start=1):
        severity = action_severity(action)
        actions.append(
            {
                "sourceLabel": source.label,
                "sourceRole": source.role,
                "sourceManifestKey": source.manifest_key,
                "sourceReport": str(report_path),
                "sourceNotesPacket": action.get("sourceNotesPacket") or selected_candidate_path(report),
                "severity": severity,
                "actionType": action.get("actionType") or "context-only",
                "decision": action.get("decision") or "undecided",
                "label": action_label(action, f"{source.label} action {index}"),
                "timecode": action_timecode(action),
                "sequenceStartSeconds": action.get("sequenceStartSeconds"),
                "durationSeconds": action.get("durationSeconds"),
                "reviewerNotes": action.get("reviewerNotes") or action.get("notes") or "",
                "firstMove": action.get("firstMove") or "Review the owning inbox report before changing audio.",
                "safeTreatmentPath": action.get("safeTreatmentPath") or [],
                "doNotDo": action.get("doNotDo") or [
                    "Do not overwrite v006.",
                    "Do not mutate source media.",
                    "Do not approve or unlock branches from this queue alone.",
                ],
            }
        )
    return actions


def load_source(source: QueueSource, outputs: dict[str, Any]) -> dict[str, Any]:
    json_path = output_path(outputs.get(source.manifest_key))
    markdown_path = output_path(outputs.get(source.markdown_key))
    path = Path(json_path).expanduser() if json_path else None
    if not path or not path.exists():
        return {
            "label": source.label,
            "role": source.role,
            "manifestKey": source.manifest_key,
            "jsonPath": json_path,
            "markdownPath": markdown_path,
            "exists": False,
            "schema": None,
            "matchingCandidateCount": 0,
            "validNotesPacketCount": 0,
            "selectedCandidate": None,
            "repairActionCount": 0,
            "focusedProofActionCount": 0,
            "passContextCount": 0,
            "contextActionCount": 0,
            "actions": [],
            "status": "missing-inbox-report",
        }
    try:
        report = read_json(path)
    except Exception as exc:  # noqa: BLE001 - this is an audit surface, not a crash trap.
        return {
            "label": source.label,
            "role": source.role,
            "manifestKey": source.manifest_key,
            "jsonPath": str(path),
            "markdownPath": markdown_path,
            "exists": True,
            "schema": None,
            "matchingCandidateCount": 0,
            "validNotesPacketCount": 0,
            "selectedCandidate": None,
            "repairActionCount": 0,
            "focusedProofActionCount": 0,
            "passContextCount": 0,
            "contextActionCount": 0,
            "actions": [],
            "status": f"unreadable-report: {exc}",
        }

    actions = extract_actions(source, report, path)
    repair_count = sum(1 for action in actions if action["severity"] == "repair")
    proof_count = sum(1 for action in actions if action["severity"] == "proof")
    pass_count = sum(1 for action in actions if action["severity"] == "pass-context")
    context_count = sum(1 for action in actions if action["severity"] == "context")
    matching_count = coerce_int(report.get("matchingCandidateCount"))
    valid_count = coerce_int(report.get("validNotesPacketCount"))
    selected_path = selected_candidate_path(report)
    if repair_count:
        status = "repair-requested"
    elif proof_count:
        status = "focused-proof-requested"
    elif pass_count:
        status = "pass-context-recorded"
    elif matching_count or valid_count or selected_path:
        status = "notes-found-no-repair"
    else:
        status = "awaiting-exported-notes"

    return {
        "label": source.label,
        "role": source.role,
        "manifestKey": source.manifest_key,
        "jsonPath": str(path),
        "markdownPath": markdown_path,
        "exists": True,
        "schema": report.get("schema"),
        "matchingCandidateCount": matching_count,
        "validNotesPacketCount": valid_count,
        "selectedCandidate": selected_path,
        "repairActionCount": repair_count,
        "focusedProofActionCount": proof_count,
        "passContextCount": pass_count,
        "contextActionCount": context_count,
        "actions": actions,
        "status": status,
        "nextSafestAction": report.get("nextSafestAction") or report.get("suggestedDecisionStatus"),
    }


def command_block(lines: list[str]) -> list[str]:
    return ["```bash", *lines, "```"]


def command_lines(report: dict[str, Any]) -> dict[str, list[str]]:
    baseline_dir = report["baselineDir"]
    return {
        "rerunQueue": [
            "OUT=" + shell_quote(baseline_dir),
            'python3 apps/QuipslyStudio/script/audio_workbench_post_review_action_queue.py --baseline-dir "$OUT"',
        ],
        "openStartHere": ["open " + shell_quote(str(Path(baseline_dir) / "START_HERE_EPISODE_4_AUDIO_REVIEW.md"))],
        "openRepairPlanner": [
            "OUT=" + shell_quote(baseline_dir),
            'python3 apps/QuipslyStudio/script/audio_workbench_listen_notes_repair_planner.py --baseline-dir "$OUT"',
        ],
    }


def next_safest_action(repair_count: int, proof_count: int, candidate_source_count: int) -> str:
    if repair_count:
        return "Human notes include repair requests. Keep v006 locked, use the owning inbox reports plus the repair/tuning console, and render only scoped proof candidates before any full v007 promotion."
    if proof_count:
        return "Human notes request focused proof. Build or open proof windows for those moments before pass/fail or branch inheritance."
    if candidate_source_count:
        return "Reviewer notes were found but no repair/proof action is requested. Preserve them as pass/context and continue the broader human-listen decision path."
    return "No exported human notes are currently registered. Open START_HERE, listen through the priority surfaces, export notes, then run the post-human-listen roundtrip."


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Audio Post-Review Action Queue: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This is the single after-notes queue for Episode 4 audio review. It gathers every registered notes inbox and repair planner into one visible board. It does not approve audio, fail audio, render media, upload files, unlock branches, or mutate original media.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Sources scanned: `{report['sourceCount']}`",
        f"- Sources with notes candidates: `{report['sourceWithNotesCandidateCount']}`",
        f"- Repair actions: `{report['repairActionCount']}`",
        f"- Focused proof actions: `{report['focusedProofActionCount']}`",
        f"- Pass/context actions: `{report['passContextCount']}`",
        "",
        "## Next safest action",
        "",
        report["nextSafestAction"],
        "",
        "## Source board",
        "",
        "| Source | Role | Status | Notes packets | Repair | Proof | Pass/context | Report |",
        "|---|---|---|---:|---:|---:|---:|---|",
    ]
    for source in report["sources"]:
        notes_count = max(int(source.get("matchingCandidateCount") or 0), int(source.get("validNotesPacketCount") or 0), 1 if source.get("selectedCandidate") else 0)
        lines.append(
            f"| {source['label']} | {source['role']} | `{source['status']}` | {notes_count} | {source['repairActionCount']} | {source['focusedProofActionCount']} | {source['passContextCount']} | `{source.get('markdownPath') or source.get('jsonPath') or 'not registered'}` |"
        )
    if report["actions"]:
        lines.extend(["", "## Action queue", ""])
        for index, action in enumerate(report["actions"], start=1):
            lines.extend(
                [
                    f"### {index}. {action['label']}",
                    "",
                    f"- Source: `{action['sourceLabel']}`",
                    f"- Severity: `{action['severity']}`",
                    f"- Type: `{action['actionType']}`",
                    f"- Decision: `{action['decision']}`",
                    f"- Time: `{action['timecode']}`",
                    f"- Notes packet: `{action.get('sourceNotesPacket') or 'not registered'}`",
                    f"- Reviewer notes: {action.get('reviewerNotes') or '_none_'}",
                    f"- First move: {action['firstMove']}",
                    "",
                ]
            )
    else:
        lines.extend(
            [
                "",
                "## No action items yet",
                "",
                "No exported human notes currently request repair or focused proof. That is not approval; it means the next move is still human listening and notes export.",
                "",
            ]
        )
    lines.extend(
        [
            "## Useful commands",
            "",
            "Rebuild this queue:",
            "",
            *command_block(report["commands"]["rerunQueue"]),
            "",
            "Open START_HERE:",
            "",
            *command_block(report["commands"]["openStartHere"]),
            "",
            "Refresh legacy repair planner:",
            "",
            *command_block(report["commands"]["openRepairPlanner"]),
            "",
            "## Guardrails",
            "",
            f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
            f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
            f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
            f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
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
    before = read_json(manifest_path)
    outputs = before.setdefault("outputs", {})
    baseline_id = str(before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    sources = [load_source(source, outputs) for source in SOURCES]
    actions = [action for source in sources for action in source.get("actions", [])]
    repair_count = sum(1 for action in actions if action["severity"] == "repair")
    proof_count = sum(1 for action in actions if action["severity"] == "proof")
    pass_count = sum(1 for action in actions if action["severity"] == "pass-context")
    context_count = sum(1 for action in actions if action["severity"] == "context")
    source_with_notes_count = sum(
        1
        for source in sources
        if coerce_int(source.get("matchingCandidateCount"))
        or coerce_int(source.get("validNotesPacketCount"))
        or source.get("selectedCandidate")
    )

    output_json = baseline_dir / f"audio-post-review-action-queue-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"audio-post-review-action-queue-{slug}-{generated_at}.md"
    report = {
        "schema": "quipsly.audio-workbench.post-review-action-queue.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "status": "ready-for-review-actions",
        "approvalStatus": before.get("approvalStatus"),
        "packageReadyForHumanListen": bool(before.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(before.get("branchInheritanceReady")),
        "branchRenderReady": bool(before.get("branchRenderReady")),
        "sourceCount": len(sources),
        "defectAtlasNotesSourceRegistered": any(source.get("manifestKey") == "latestAudioDefectAtlasNotesInbox" for source in sources),
        "sourceWithNotesCandidateCount": source_with_notes_count,
        "repairActionCount": repair_count,
        "focusedProofActionCount": proof_count,
        "passContextCount": pass_count,
        "contextActionCount": context_count,
        "sources": sources,
        "actions": actions,
        "nextSafestAction": next_safest_action(repair_count, proof_count, source_with_notes_count),
        "commands": {},
        "markdown": str(output_md),
        "json": str(output_json),
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }
    report["commands"] = command_lines(report)
    write_json(output_json, report)
    output_md.write_text(render_markdown(report) + "\n", encoding="utf-8")

    after = read_json(manifest_path)
    outputs_after = after.setdefault("outputs", {})
    outputs_after["latestAudioPostReviewActionQueue"] = str(output_json)
    outputs_after["latestAudioPostReviewActionQueueMarkdown"] = str(output_md)
    history = outputs_after.setdefault("audioPostReviewActionQueues", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    after["audioPostReviewActionQueueCount"] = len(history)
    after["audioPostReviewActionQueueLatestStatus"] = report["status"]
    after["audioPostReviewActionQueueLatestSourceCount"] = len(sources)
    after["audioPostReviewActionQueueLatestDefectAtlasNotesSourceRegistered"] = report["defectAtlasNotesSourceRegistered"]
    after["audioPostReviewActionQueueLatestSourceWithNotesCandidateCount"] = source_with_notes_count
    after["audioPostReviewActionQueueLatestRepairActionCount"] = repair_count
    after["audioPostReviewActionQueueLatestFocusedProofActionCount"] = proof_count
    after["audioPostReviewActionQueueLatestPassContextCount"] = pass_count
    after["audioPostReviewActionQueueLatestApprovalStateChanged"] = False
    after["audioPostReviewActionQueueLatestBranchStateChanged"] = False
    after["audioPostReviewActionQueueLatestRenderAttempted"] = False
    after["audioPostReviewActionQueueLatestOriginalMediaMutated"] = False
    after["approvalStatus"] = before.get("approvalStatus")
    after["packageReadyForHumanListen"] = bool(before.get("packageReadyForHumanListen"))
    after["branchInheritanceReady"] = bool(before.get("branchInheritanceReady"))
    after["branchRenderReady"] = bool(before.get("branchRenderReady"))
    write_json(manifest_path, after)

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "json": str(output_json),
                "markdown": str(output_md),
                "sourceWithNotesCandidateCount": source_with_notes_count,
                "repairActionCount": repair_count,
                "focusedProofActionCount": proof_count,
                "passContextCount": pass_count,
                "approvalStateChanged": False,
                "branchStateChanged": False,
                "renderAttempted": False,
                "originalMediaMutated": False,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
