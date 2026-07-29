#!/usr/bin/env python3
"""Find exported producer-grade audio audit notes for an audio baseline.

The producer-grade audit focuses human listening on the riskiest machine-known
moments. This inbox validates exported notes from that audit and turns reviewer
choices into scoped next actions.

It does not approve audio, fail audio by itself, render branches, upload files,
or mutate original media.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA = "quipsly.audio-workbench.producer-grade-notes.v1"
REPAIR_DECISIONS = {"needs-repair", "repair", "fail", "failed"}
PROOF_DECISIONS = {"needs-proof", "more-proof", "needs-focused-proof"}
PASS_DECISIONS = {"pass", "ok", "acceptable", "approved-context"}

@dataclass(frozen=True)
class Candidate:
    path: Path
    item_count: int
    pass_count: int
    needs_repair_count: int
    needs_proof_count: int
    undecided_count: int
    suggested_status: str
    exported_at: str
    mtime: float

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

def safe_slug(value: str) -> str:
    out = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in value.lower())
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"

def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"

def default_search_dirs(baseline_dir: Path) -> list[Path]:
    home = Path.home()
    return [home / "Downloads", home / "Desktop", baseline_dir]

def iter_json_files(search_dirs: list[Path]) -> list[Path]:
    patterns = ["*producer-grade*notes*.json", "*producer-audit*notes*.json", "*audio-producer*notes*.json"]
    files: list[Path] = []
    seen: set[Path] = set()
    for directory in search_dirs:
        directory = directory.expanduser()
        if not directory.exists() or not directory.is_dir():
            continue
        for pattern in patterns:
            for path in directory.glob(pattern):
                resolved = path.resolve()
                if path.is_file() and resolved not in seen:
                    files.append(resolved)
                    seen.add(resolved)
        if (directory / "manifest.json").exists():
            for pattern in patterns:
                for path in directory.glob(f"*/{pattern}"):
                    resolved = path.resolve()
                    if path.is_file() and resolved not in seen:
                        files.append(resolved)
                        seen.add(resolved)
    return sorted(files, key=lambda item: item.stat().st_mtime if item.exists() else 0, reverse=True)

def normalized_items(packet: dict[str, Any]) -> list[dict[str, Any]]:
    rows = packet.get("items") or packet.get("notes") or []
    return [dict(item) for item in rows if isinstance(item, dict)]

def normalize_decision(value: Any) -> str:
    return str(value or "undecided").strip().lower() or "undecided"

def count_decisions(packet: dict[str, Any]) -> tuple[int, int, int, int, int]:
    item_count = pass_count = needs_repair_count = needs_proof_count = undecided_count = 0
    for item in normalized_items(packet):
        item_count += 1
        decision = normalize_decision(item.get("decision"))
        if decision in REPAIR_DECISIONS:
            needs_repair_count += 1
        elif decision in PROOF_DECISIONS:
            needs_proof_count += 1
        elif decision in PASS_DECISIONS:
            pass_count += 1
        else:
            undecided_count += 1
    return item_count, pass_count, needs_repair_count, needs_proof_count, undecided_count

def suggested_status(packet: dict[str, Any]) -> str:
    item_count, pass_count, needs_repair_count, needs_proof_count, undecided_count = count_decisions(packet)
    if needs_repair_count:
        return "failed-human-listen"
    if needs_proof_count:
        return "needs-focused-proof"
    if item_count and pass_count == item_count and undecided_count == 0:
        return "producer-audit-all-pass-context"
    return "pending-human-listen"

def classify_file(path: Path, baseline_id: str) -> tuple[Candidate | None, dict[str, Any] | None]:
    try:
        packet = read_json(path)
    except Exception as exc:
        return None, {"path": str(path), "reason": f"not readable JSON: {exc}"}
    if packet.get("schema") != SCHEMA:
        return None, {"path": str(path), "reason": f"unsupported schema: {packet.get('schema')}"}
    if packet.get("baselineId") != baseline_id:
        return None, {"path": str(path), "reason": f"wrong baselineId: {packet.get('baselineId')} != {baseline_id}"}
    exported_at = str(packet.get("exportedAt") or "").strip()
    if not exported_at:
        return None, {"path": str(path), "reason": "notes packet has no exportedAt"}
    item_count, pass_count, needs_repair_count, needs_proof_count, undecided_count = count_decisions(packet)
    return Candidate(path, item_count, pass_count, needs_repair_count, needs_proof_count, undecided_count, suggested_status(packet), exported_at, path.stat().st_mtime), None

def selected_items(packet: dict[str, Any]) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []
    for item in normalized_items(packet):
        decision = normalize_decision(item.get("decision"))
        if decision in REPAIR_DECISIONS or decision in PROOF_DECISIONS or decision in PASS_DECISIONS:
            selected.append(item)
    return selected

def action_for_item(item: dict[str, Any]) -> dict[str, Any]:
    decision = normalize_decision(item.get("decision"))
    label = str(item.get("label") or item.get("momentLabel") or item.get("momentId") or "producer audit moment")
    timecode = str(item.get("time") or item.get("timecode") or "unknown")
    source = str(item.get("source") or "producer-grade audit")
    severity = str(item.get("severity") or "unknown")
    note = str(item.get("notes") or item.get("note") or "").strip()
    if decision in REPAIR_DECISIONS:
        action_type = "v007-repair-required"
        first_move = "Route the finding through the repair/tuning console and render a scoped proof candidate before any full baseline promotion."
    elif decision in PROOF_DECISIONS:
        action_type = "focused-proof-needed"
        first_move = "Render or assemble focused proof around this moment before deciding whether v006 needs repair."
    elif decision in PASS_DECISIONS:
        action_type = "producer-pass-context"
        first_move = "Keep this as human pass context; it does not approve the whole baseline by itself."
    else:
        action_type = "context-only"
        first_move = "Keep as context only."
    return {
        "actionType": action_type,
        "decision": decision,
        "label": label,
        "timecode": timecode,
        "source": source,
        "severity": severity,
        "reviewerNotes": note,
        "firstMove": first_move,
        "safeTreatmentPath": [
            "Keep v006 locked while this note is evaluated.",
            "Use the owning audio stage named by the repair/tuning console instead of rerunning the whole pipeline blindly.",
            "Create timestamped proof windows before a full-length v007 candidate.",
            "Promote only after human listening confirms the candidate improves the issue without new artifacts.",
        ],
        "doNotDo": [
            "Do not treat producer-audit pass notes as whole-spine approval.",
            "Do not overwrite v006.",
            "Do not mutate source media.",
            "Do not unlock branch inheritance from this inbox alone.",
        ],
    }

def candidate_dict(candidate: Candidate | None) -> dict[str, Any] | None:
    if candidate is None:
        return None
    return {
        "path": str(candidate.path),
        "sourceSchema": SCHEMA,
        "exportedAt": candidate.exported_at,
        "itemCount": candidate.item_count,
        "passCount": candidate.pass_count,
        "needsRepairCount": candidate.needs_repair_count,
        "needsProofCount": candidate.needs_proof_count,
        "undecidedCount": candidate.undecided_count,
        "suggestedDecisionStatus": candidate.suggested_status,
        "mtime": candidate.mtime,
    }

def command_lines_for_next_step(baseline_dir: Path, actions: list[dict[str, Any]]) -> list[str]:
    if not actions:
        return ["# No producer audit notes found. Keep v006 locked and continue listening."]
    if any(action["actionType"] == "v007-repair-required" for action in actions):
        return ["OUT=" + shell_quote(str(baseline_dir)), "# Open the repair planner and repair/tuning console before rendering any v007 candidate.", 'python3 apps/QuipslyStudio/script/audio_workbench_listen_notes_repair_planner.py --baseline-dir "$OUT"', 'open "$OUT/START_HERE_EPISODE_4_AUDIO_REVIEW.md"']
    if any(action["actionType"] == "focused-proof-needed" for action in actions):
        return ["OUT=" + shell_quote(str(baseline_dir)), "# Build focused proof windows for the producer-audit moments that still need evidence.", 'python3 apps/QuipslyStudio/script/audio_workbench_producer_grade_notes_inbox.py --baseline-dir "$OUT"']
    return ["OUT=" + shell_quote(str(baseline_dir)), "# Producer audit moments passed as context. Continue the broader human listen path before approval.", 'python3 apps/QuipslyStudio/script/audio_workbench_post_human_listen_notes_roundtrip.py --baseline-dir "$OUT"']

def render_markdown(report: dict[str, Any]) -> str:
    selected = report.get("selectedCandidate") or {}
    lines = [
        "# Producer-Grade Audio Notes Inbox", "", f"Generated: `{report['generatedAt']}`", "",
        "This inbox finds exported notes from the producer-grade machine audit. It turns pass, needs-proof, and needs-repair decisions into scoped next actions. It does not approve v006, fail v006 by itself, render branches, upload files, or mutate source media.", "",
        "## Current truth", "", f"- Baseline: `{report['baselineId']}`", f"- Approval status before scan: `{report['approvalStatusBefore']}`", f"- Branch inheritance ready before scan: `{str(report['branchInheritanceReadyBefore']).lower()}`", f"- Branch render ready before scan: `{str(report['branchRenderReadyBefore']).lower()}`", f"- Matching notes packets: `{report['matchingCandidateCount']}`", f"- Ignored files: `{len(report['ignoredFiles'])}`", f"- Selected candidate: `{selected.get('path') or 'none'}`", f"- Suggested status: `{selected.get('suggestedDecisionStatus') or 'none'}`", "",
        "## Candidate table", "", "| Path | Items | Pass | Needs repair | Needs proof | Undecided | Suggested |", "|---|---:|---:|---:|---:|---:|---|",
    ]
    for candidate in report["matchingCandidates"]:
        lines.append(f"| `{candidate['path']}` | {candidate['itemCount']} | {candidate['passCount']} | {candidate['needsRepairCount']} | {candidate['needsProofCount']} | {candidate['undecidedCount']} | `{candidate['suggestedDecisionStatus']}` |")
    if report["reviewActions"]:
        lines.extend(["", "## Producer review actions", ""])
        for index, action in enumerate(report["reviewActions"], start=1):
            lines.extend([f"### {index}. {action['label']}", "", f"- Type: `{action['actionType']}`", f"- Decision: `{action['decision']}`", f"- Time: `{action['timecode']}`", f"- Source: `{action['source']}`", f"- Severity: `{action['severity']}`", f"- Reviewer notes: {action['reviewerNotes'] or '_none_'}", f"- First move: {action['firstMove']}", "", "Safe treatment path:", "", *[f"- {step}" for step in action["safeTreatmentPath"]], ""])
    else:
        lines.extend(["", "## No producer notes yet", "", "No matching producer-audit notes were found. Keep v006 locked and continue listening.", ""])
    lines.extend(["## Next command shape", "", "```bash", *report["nextCommand"], "```", "", "## Guardrails", "", f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`", f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`", f"- Render attempted: `{str(report['renderAttempted']).lower()}`", f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`", ""])
    return "\n".join(lines)

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--search-dir", action="append", type=Path, default=[])
    parser.add_argument("--no-default-search", action="store_true")
    args = parser.parse_args()
    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    before = read_json(manifest_path)
    baseline_id = str(before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    search_dirs = ([] if args.no_default_search else default_search_dirs(baseline_dir)) + [path.expanduser() for path in args.search_dir]
    candidates: list[Candidate] = []
    ignored: list[dict[str, Any]] = []
    for path in iter_json_files(search_dirs):
        candidate, reason = classify_file(path, baseline_id)
        if candidate:
            candidates.append(candidate)
        elif reason:
            ignored.append(reason)
    candidates = sorted(candidates, key=lambda item: item.mtime, reverse=True)
    selected = candidates[0] if candidates else None
    selected_packet = read_json(selected.path) if selected else None
    actions = [action_for_item(item) for item in selected_items(selected_packet)] if selected_packet else []
    output_json = baseline_dir / f"producer-grade-notes-inbox-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"producer-grade-notes-inbox-{slug}-{generated_at}.md"
    report = {
        "schema": "quipsly.audio-workbench.producer-grade-notes-inbox.v1", "generatedAt": generated_at, "baselineId": baseline_id, "baselineDir": str(baseline_dir), "searchDirs": [str(path) for path in search_dirs],
        "approvalStatusBefore": before.get("approvalStatus"), "branchInheritanceReadyBefore": bool(before.get("branchInheritanceReady")), "branchRenderReadyBefore": bool(before.get("branchRenderReady")),
        "matchingCandidateCount": len(candidates), "matchingCandidates": [candidate_dict(candidate) for candidate in candidates], "selectedCandidate": candidate_dict(selected), "ignoredFiles": ignored, "reviewActions": actions,
        "repairActionCount": sum(1 for action in actions if action["actionType"] == "v007-repair-required"), "focusedProofActionCount": sum(1 for action in actions if action["actionType"] == "focused-proof-needed"), "passContextCount": sum(1 for action in actions if action["actionType"] == "producer-pass-context"),
        "nextCommand": command_lines_for_next_step(baseline_dir, actions), "approvalStateChanged": False, "branchStateChanged": False, "renderAttempted": False, "originalMediaMutated": False, "markdown": str(output_md), "json": str(output_json),
    }
    write_json(output_json, report)
    output_md.write_text(render_markdown(report), encoding="utf-8")
    after = read_json(manifest_path)
    outputs = after.setdefault("outputs", {})
    outputs["latestAudioProducerGradeNotesInbox"] = str(output_json)
    outputs["latestAudioProducerGradeNotesInboxMarkdown"] = str(output_md)
    history = outputs.setdefault("audioProducerGradeNotesInboxHistory", [])
    if isinstance(history, list):
        history.append(str(output_json))
    after["audioProducerGradeNotesInboxCount"] = int(after.get("audioProducerGradeNotesInboxCount") or 0) + 1
    after["audioProducerGradeNotesInboxLatestCandidateCount"] = len(candidates)
    after["audioProducerGradeNotesInboxLatestActionCount"] = len(actions)
    after["approvalStatus"] = before.get("approvalStatus")
    after["packageReadyForHumanListen"] = bool(before.get("packageReadyForHumanListen"))
    after["branchInheritanceReady"] = bool(before.get("branchInheritanceReady"))
    after["branchRenderReady"] = bool(before.get("branchRenderReady"))
    write_json(manifest_path, after)
    print(json.dumps({"baselineId": baseline_id, "json": str(output_json), "markdown": str(output_md), "matchingCandidateCount": len(candidates), "repairActionCount": report["repairActionCount"], "focusedProofActionCount": report["focusedProofActionCount"], "passContextCount": report["passContextCount"], "approvalStateChanged": False, "branchStateChanged": False, "renderAttempted": False, "originalMediaMutated": False}, indent=2, sort_keys=True))

if __name__ == "__main__":
    main()
