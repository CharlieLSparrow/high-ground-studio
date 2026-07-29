#!/usr/bin/env python3
"""Find returned Human Listen Mission Reel notes for an audio baseline.

Mission Reel notes are focused review evidence. They can request a scoped
repair, ask for focused proof, or contribute pass context. They do not approve
v006, unlock branch inheritance, render branches, upload, publish, or mutate
original media.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA = "quipsly.audio-workbench.human-listen-mission-reel-notes.v1"
REPAIR_DECISIONS = {"fail", "failed", "needs-repair", "repair", "needs-scoped-repair", "needs-scoped-v007-repair", "scoped-v007-repair"}
PROOF_DECISIONS = {"unsure", "needs-proof", "more-proof", "needs-more-proof", "needs-focused-proof", "focused-proof-needed"}
PASS_DECISIONS = {"pass", "passed", "ok", "acceptable", "sounds-good", "focused-pass"}
IGNORE_DECISIONS = {"ignore", "not-a-problem", "not-audio-problem"}


@dataclass(frozen=True)
class Candidate:
    path: Path
    row_count: int
    pass_count: int
    repair_count: int
    proof_count: int
    ignore_count: int
    pending_count: int
    overall_decision: str
    mission_reel_decision: str
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
    patterns = [
        "*mission-reel*notes*.json",
        "*MISSION_REEL*NOTES*.json",
        "*human-listen-mission-reel-notes*.json",
        "HUMAN_LISTEN_MISSION_REEL_NOTES_TEMPLATE.json",
    ]
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
    return sorted(files, key=lambda item: item.stat().st_mtime if item.exists() else 0, reverse=True)


def normalized_rows(packet: dict[str, Any]) -> list[dict[str, Any]]:
    rows = packet.get("rows") or packet.get("notes") or []
    return [dict(item) for item in rows if isinstance(item, dict)]


def normalize_decision(value: Any) -> str:
    return str(value or "pending").strip().lower() or "pending"


def count_decisions(packet: dict[str, Any]) -> tuple[int, int, int, int, int, int]:
    row_count = pass_count = repair_count = proof_count = ignore_count = pending_count = 0
    for row in normalized_rows(packet):
        row_count += 1
        decision = normalize_decision(row.get("decision"))
        if decision in PASS_DECISIONS:
            pass_count += 1
        elif decision in REPAIR_DECISIONS:
            repair_count += 1
        elif decision in PROOF_DECISIONS:
            proof_count += 1
        elif decision in IGNORE_DECISIONS:
            ignore_count += 1
        else:
            pending_count += 1
    return row_count, pass_count, repair_count, proof_count, ignore_count, pending_count


def suggested_status(packet: dict[str, Any]) -> tuple[str, str]:
    row_count, pass_count, repair_count, proof_count, ignore_count, pending_count = count_decisions(packet)
    overall = normalize_decision(packet.get("overallDecision"))
    if overall in REPAIR_DECISIONS or repair_count:
        return "notes-found", "mission-reel-needs-scoped-repair"
    if overall in PROOF_DECISIONS or proof_count:
        return "notes-found", "mission-reel-needs-focused-proof"
    if row_count and pending_count == 0 and repair_count == 0 and proof_count == 0 and overall in PASS_DECISIONS:
        if pass_count + ignore_count == row_count:
            return "notes-found", "mission-reel-focused-pass"
    return "notes-incomplete", "mission-reel-notes-incomplete"


def classify_file(path: Path, baseline_id: str) -> tuple[Candidate | None, dict[str, Any] | None]:
    try:
        packet = read_json(path)
    except Exception as exc:  # noqa: BLE001 - inbox reports bad files instead of crashing.
        return None, {"path": str(path), "reason": f"not readable JSON: {exc}"}
    if packet.get("schema") != SCHEMA:
        return None, {"path": str(path), "reason": f"unsupported schema: {packet.get('schema')}"}
    if packet.get("baselineId") != baseline_id:
        return None, {"path": str(path), "reason": f"wrong baselineId: {packet.get('baselineId')} != {baseline_id}"}
    exported_at = str(packet.get("exportedAt") or packet.get("createdAt") or "").strip()
    if not exported_at:
        return None, {"path": str(path), "reason": "notes packet has no exportedAt or createdAt"}
    row_count, pass_count, repair_count, proof_count, ignore_count, pending_count = count_decisions(packet)
    status, decision = suggested_status(packet)
    return (
        Candidate(
            path=path,
            row_count=row_count,
            pass_count=pass_count,
            repair_count=repair_count,
            proof_count=proof_count,
            ignore_count=ignore_count,
            pending_count=pending_count,
            overall_decision=normalize_decision(packet.get("overallDecision")),
            mission_reel_decision=decision,
            suggested_status=status,
            exported_at=exported_at,
            mtime=path.stat().st_mtime,
        ),
        None,
    )


def candidate_dict(candidate: Candidate) -> dict[str, Any]:
    return {
        "path": str(candidate.path),
        "sourceSchema": SCHEMA,
        "rowCount": candidate.row_count,
        "passCount": candidate.pass_count,
        "repairCount": candidate.repair_count,
        "proofCount": candidate.proof_count,
        "ignoreCount": candidate.ignore_count,
        "pendingCount": candidate.pending_count,
        "overallDecision": candidate.overall_decision,
        "missionReelDecision": candidate.mission_reel_decision,
        "suggestedDecisionStatus": candidate.suggested_status,
        "exportedAt": candidate.exported_at,
        "mtime": candidate.mtime,
    }


def issue_lines(packet: dict[str, Any], limit: int = 20) -> list[str]:
    issues: list[str] = []
    for row in normalized_rows(packet):
        decision = normalize_decision(row.get("decision"))
        if decision not in REPAIR_DECISIONS and decision not in PROOF_DECISIONS:
            continue
        label = row.get("reelTimecode") or row.get("sourceTimecode") or f"window {row.get('index')}"
        symptom = row.get("reviewerNotes") or row.get("repairHint") or "no reviewer detail"
        issues.append(f"{label}: {decision}: {symptom}")
        if len(issues) >= limit:
            issues.append("additional mission-reel note rows omitted; see notes packet")
            break
    return issues


def suggested_route(candidate: Candidate, packet: dict[str, Any] | None) -> dict[str, Any]:
    if candidate.mission_reel_decision == "mission-reel-needs-scoped-repair":
        next_action = "Keep v006 locked and route a scoped repair for the Mission Reel windows the reviewer marked."
    elif candidate.mission_reel_decision == "mission-reel-needs-focused-proof":
        next_action = "Keep v006 locked and generate/listen to focused proof before choosing pass or repair."
    elif candidate.mission_reel_decision == "mission-reel-focused-pass":
        next_action = "Treat the Mission Reel as focused pass context only; full audio approval still requires the human-listen decision front door."
    else:
        next_action = "Notes are incomplete; keep v006 locked and request completed Mission Reel notes."
    return {
        "suggestedDecisionStatus": candidate.suggested_status,
        "missionReelDecision": candidate.mission_reel_decision,
        "nextAction": next_action,
        "issues": issue_lines(packet or {}),
        "approvalDecisionAllowed": False,
        "reason": "Mission Reel notes are focused review evidence, not a full-spine approval token.",
    }


def review_actions(candidate: Candidate | None, packet: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not candidate:
        return []
    severity = {
        "mission-reel-needs-scoped-repair": "repair",
        "mission-reel-needs-focused-proof": "proof",
        "mission-reel-focused-pass": "pass-context",
    }.get(candidate.mission_reel_decision, "context")
    actions: list[dict[str, Any]] = []
    for row in normalized_rows(packet or {}):
        decision = normalize_decision(row.get("decision"))
        if severity == "repair" and decision not in REPAIR_DECISIONS:
            continue
        if severity == "proof" and decision not in PROOF_DECISIONS:
            continue
        if severity == "pass-context" and decision not in PASS_DECISIONS and decision not in IGNORE_DECISIONS:
            continue
        actions.append(
            {
                "actionType": candidate.mission_reel_decision,
                "decision": decision,
                "severity": severity,
                "label": row.get("label") or f"Mission Reel window {row.get('index')}",
                "reelTimecode": row.get("reelTimecode"),
                "sourceTimecode": row.get("sourceTimecode"),
                "sourceStartSeconds": row.get("sourceStartSeconds"),
                "sourceEndSeconds": row.get("sourceEndSeconds"),
                "sourceNotesPacket": str(candidate.path),
                "note": row.get("reviewerNotes") or row.get("repairHint") or "",
            }
        )
    if not actions and candidate.mission_reel_decision != "mission-reel-notes-incomplete":
        actions.append(
            {
                "actionType": candidate.mission_reel_decision,
                "decision": candidate.overall_decision,
                "severity": severity,
                "label": "Mission Reel overall decision",
                "reelTimecode": "overall",
                "sourceNotesPacket": str(candidate.path),
                "note": "Overall Mission Reel notes decision without row-level actionable detail.",
            }
        )
    return actions


def render_markdown(report: dict[str, Any]) -> str:
    selected = report.get("selectedCandidate") or {}
    route = report.get("suggestedRoute") or {}
    lines = [
        "# Human Listen Mission Reel Notes Inbox",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        "",
        "This inbox finds returned Mission Reel notes and turns focused listening into safe routing evidence. It does not approve the full audio spine.",
        "",
        "## Summary",
        "",
        f"- Status: `{report['status']}`",
        f"- Matching candidates: `{report['matchingCandidateCount']}`",
        f"- Ignored files: `{len(report['ignoredFiles'])}`",
        f"- Selected candidate: `{selected.get('path') or 'none'}`",
        f"- Mission Reel decision: `{selected.get('missionReelDecision') or 'none'}`",
        f"- Suggested status: `{selected.get('suggestedDecisionStatus') or 'none'}`",
        f"- Approval decision allowed: `{str(route.get('approvalDecisionAllowed', False)).lower()}`",
        f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
        f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
        f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
        f"- Upload attempted: `{str(report['uploadAttempted']).lower()}`",
        f"- Publication attempted: `{str(report['publicationAttempted']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Next action",
        "",
        route.get("nextAction") or "No matching Mission Reel notes were found. Fill/export the notes template, then rerun this inbox.",
        "",
    ]
    if route.get("issues"):
        lines.extend(["## Issues from notes", ""])
        for issue in route["issues"]:
            lines.append(f"- {issue}")
        lines.append("")
    lines.extend(
        [
            "## Matching candidates",
            "",
            "| File | Decision | Rows | Pass | Proof | Repair | Pending |",
            "|---|---|---:|---:|---:|---:|---:|",
        ]
    )
    for candidate in report.get("matchingCandidates") or []:
        lines.append(
            f"| `{candidate['path']}` | `{candidate['missionReelDecision']}` | `{candidate['rowCount']}` | `{candidate['passCount']}` | `{candidate['proofCount']}` | `{candidate['repairCount']}` | `{candidate['pendingCount']}` |"
        )
    return "\n".join(lines) + "\n"


def write_open_command(path: Path, markdown_path: Path) -> None:
    path.write_text("#!/bin/zsh\nset -euo pipefail\nopen " + shell_quote(str(markdown_path)) + "\n", encoding="utf-8")
    path.chmod(0o755)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--search-dir", action="append", type=Path, default=[])
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    search_dirs = args.search_dir or default_search_dirs(baseline_dir)

    candidates: list[Candidate] = []
    candidate_packets: dict[str, dict[str, Any]] = {}
    ignored: list[dict[str, Any]] = []
    for path in iter_json_files(search_dirs):
        candidate, error = classify_file(path, baseline_id)
        if candidate:
            candidates.append(candidate)
            try:
                candidate_packets[str(candidate.path)] = read_json(candidate.path)
            except json.JSONDecodeError:
                pass
        elif error:
            ignored.append(error)

    selected = candidates[0] if candidates else None
    selected_packet = candidate_packets.get(str(selected.path)) if selected else None
    route = suggested_route(selected, selected_packet) if selected else {}
    actions = review_actions(selected, selected_packet)
    status = selected.suggested_status if selected else "waiting-for-mission-reel-notes"

    report = {
        "schema": "quipsly.audio-workbench.human-listen-mission-reel-notes-inbox.v1",
        "generatedAt": generated_at,
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "status": status,
        "searchDirs": [str(path) for path in search_dirs],
        "matchingCandidateCount": len(candidates),
        "matchingCandidates": [candidate_dict(item) for item in candidates],
        "selectedCandidate": candidate_dict(selected) if selected else None,
        "ignoredFiles": ignored[:50],
        "suggestedRoute": route,
        "reviewActions": actions,
        "missionReelDecision": selected.mission_reel_decision if selected else "none",
        "repairActionCount": selected.repair_count if selected else 0,
        "focusedProofActionCount": selected.proof_count if selected else 0,
        "passContextCount": (selected.pass_count + selected.ignore_count) if selected else 0,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }

    stable_json = baseline_dir / "HUMAN_LISTEN_MISSION_REEL_NOTES_INBOX.json"
    stable_md = baseline_dir / "HUMAN_LISTEN_MISSION_REEL_NOTES_INBOX.md"
    stable_open = baseline_dir / "OPEN_HUMAN_LISTEN_MISSION_REEL_NOTES_INBOX.command"
    version_dir = baseline_dir / f"human-listen-mission-reel-notes-inbox-{slug}-{generated_at}"
    version_dir.mkdir(parents=True, exist_ok=True)
    version_json = version_dir / "human-listen-mission-reel-notes-inbox.json"
    version_md = version_dir / "human-listen-mission-reel-notes-inbox.md"
    version_open = version_dir / "open-human-listen-mission-reel-notes-inbox.command"
    report.update(
        {
            "path": str(stable_json),
            "markdownPath": str(stable_md),
            "openCommand": str(stable_open),
            "versionedPath": str(version_json),
            "versionedMarkdownPath": str(version_md),
            "versionedOpenCommand": str(version_open),
        }
    )
    markdown = render_markdown(report)
    for path in (stable_json, version_json):
        write_json(path, report)
    for path in (stable_md, version_md):
        path.write_text(markdown, encoding="utf-8")
    for path in (stable_open, version_open):
        write_open_command(path, stable_md)

    manifest_after = read_json(manifest_path)
    outputs = manifest_after.setdefault("outputs", {})
    outputs["latestAudioHumanListenMissionReelNotesInbox"] = str(stable_json)
    outputs["latestAudioHumanListenMissionReelNotesInboxMarkdown"] = str(stable_md)
    outputs["latestAudioHumanListenMissionReelNotesInboxOpenCommand"] = str(stable_open)
    history = outputs.setdefault("audioHumanListenMissionReelNotesInboxes", [])
    if isinstance(history, list):
        history.append(str(version_json))
    manifest_after["audioHumanListenMissionReelNotesInboxCount"] = int(manifest_after.get("audioHumanListenMissionReelNotesInboxCount") or 0) + 1
    manifest_after["audioHumanListenMissionReelNotesInboxLatestStatus"] = report["status"]
    manifest_after["audioHumanListenMissionReelNotesInboxMatchingCandidateCount"] = len(candidates)
    manifest_after["audioHumanListenMissionReelNotesInboxRepairActionCount"] = report["repairActionCount"]
    manifest_after["audioHumanListenMissionReelNotesInboxFocusedProofActionCount"] = report["focusedProofActionCount"]
    manifest_after["audioHumanListenMissionReelNotesInboxPassContextCount"] = report["passContextCount"]
    manifest_after["audioHumanListenMissionReelNotesInboxApprovalStateChanged"] = False
    manifest_after["audioHumanListenMissionReelNotesInboxBranchStateChanged"] = False
    manifest_after["audioHumanListenMissionReelNotesInboxRenderAttempted"] = False
    manifest_after["audioHumanListenMissionReelNotesInboxBranchRenderAttempted"] = False
    manifest_after["audioHumanListenMissionReelNotesInboxUploadAttempted"] = False
    manifest_after["audioHumanListenMissionReelNotesInboxPublicationAttempted"] = False
    manifest_after["audioHumanListenMissionReelNotesInboxOriginalMediaMutated"] = False
    write_json(manifest_path, manifest_after)
    print(json.dumps({"json": str(stable_json), "markdown": str(stable_md), "status": report["status"], "matchingCandidateCount": len(candidates), "missionReelDecision": report["missionReelDecision"]}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
