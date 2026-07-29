#!/usr/bin/env python3
"""Find exported speaker-cleanup triage notes for an audio baseline.

The speaker cleanup triage board is a symptom-first review surface. This inbox
validates exported notes from that board and creates a safe routing summary. It
never treats focused cleanup notes as full audio approval by themselves.

It does not approve audio, fail audio without a guarded decision route, render
branches, upload files, publish, or mutate original media.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA = "quipsly.audio-workbench.speaker-cleanup-triage-notes.v1"
REPAIR_DECISIONS = {"fail", "failed", "needs-repair", "repair", "needs-scoped-v007-repair"}
PROOF_DECISIONS = {"unsure", "needs-proof", "more-proof", "needs-more-proof", "needs-focused-proof"}
PASS_DECISIONS = {"pass", "passed", "ok", "acceptable"}


@dataclass(frozen=True)
class Candidate:
    path: Path
    row_count: int
    pass_count: int
    repair_count: int
    proof_count: int
    pending_count: int
    overall_decision: str
    suggested_status: str
    triage_decision: str
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


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def safe_slug(value: str) -> str:
    out = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in value.lower())
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in ("path", "jsonPath", "markdownPath", "htmlPath", "openCommand", "notesTemplatePath"):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def default_search_dirs(baseline_dir: Path) -> list[Path]:
    home = Path.home()
    return [home / "Downloads", home / "Desktop", baseline_dir]


def iter_json_files(search_dirs: list[Path]) -> list[Path]:
    patterns = [
        "*speaker-cleanup-triage*notes*.json",
        "*speaker-cleanup-triage-notes*.json",
        "*SPEAKER_CLEANUP_TRIAGE*NOTES*.json",
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


def count_decisions(packet: dict[str, Any]) -> tuple[int, int, int, int, int]:
    row_count = pass_count = repair_count = proof_count = pending_count = 0
    for row in normalized_rows(packet):
        row_count += 1
        decision = normalize_decision(row.get("decision"))
        if decision in PASS_DECISIONS:
            pass_count += 1
        elif decision in REPAIR_DECISIONS:
            repair_count += 1
        elif decision in PROOF_DECISIONS:
            proof_count += 1
        else:
            pending_count += 1
    return row_count, pass_count, repair_count, proof_count, pending_count


def suggested_status(packet: dict[str, Any]) -> tuple[str, str]:
    row_count, pass_count, repair_count, proof_count, pending_count = count_decisions(packet)
    overall = normalize_decision(packet.get("overallDecision"))
    if overall in REPAIR_DECISIONS or repair_count:
        return "failed-human-listen", "needs-scoped-v007-repair"
    if overall in PROOF_DECISIONS or proof_count:
        return "needs-focused-proof", "needs-more-proof"
    if row_count and pass_count == row_count and pending_count == 0 and overall in PASS_DECISIONS:
        return "pending-human-listen", "speaker-cleanup-passed"
    return "pending-human-listen", "pending-or-incomplete"


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
    row_count, pass_count, repair_count, proof_count, pending_count = count_decisions(packet)
    status, triage_decision = suggested_status(packet)
    return (
        Candidate(
            path=path,
            row_count=row_count,
            pass_count=pass_count,
            repair_count=repair_count,
            proof_count=proof_count,
            pending_count=pending_count,
            overall_decision=normalize_decision(packet.get("overallDecision")),
            suggested_status=status,
            triage_decision=triage_decision,
            exported_at=exported_at,
            mtime=path.stat().st_mtime,
        ),
        None,
    )


def issue_lines(packet: dict[str, Any], limit: int = 20) -> list[str]:
    issues: list[str] = []
    for row in normalized_rows(packet):
        decision = normalize_decision(row.get("decision"))
        if decision not in REPAIR_DECISIONS and decision not in PROOF_DECISIONS:
            continue
        label = row.get("timecode") or f"window {row.get('index')}"
        symptom = row.get("symptomHeard") or row.get("repairRequest") or row.get("note") or "no reviewer detail"
        issues.append(f"{label}: {decision}: {symptom}")
        if len(issues) >= limit:
            issues.append("additional triage rows omitted; see notes packet")
            break
    return issues


def candidate_dict(candidate: Candidate) -> dict[str, Any]:
    return {
        "path": str(candidate.path),
        "sourceSchema": SCHEMA,
        "rowCount": candidate.row_count,
        "passCount": candidate.pass_count,
        "repairCount": candidate.repair_count,
        "proofCount": candidate.proof_count,
        "pendingCount": candidate.pending_count,
        "overallDecision": candidate.overall_decision,
        "suggestedDecisionStatus": candidate.suggested_status,
        "speakerCleanupTriageDecision": candidate.triage_decision,
        "exportedAt": candidate.exported_at,
        "mtime": candidate.mtime,
    }


def record_command(*, baseline_dir: Path, candidate: Candidate, packet: dict[str, Any] | None, reviewer: str, dry_run: bool) -> list[str]:
    if candidate.triage_decision == "needs-scoped-v007-repair":
        notes = "Speaker-cleanup triage found a focused issue. Keep v006 locked and route a scoped v007 proof-window repair."
    elif candidate.triage_decision == "needs-more-proof":
        notes = "Speaker-cleanup triage needs focused proof before v006 can be accepted. Keep branch inheritance locked."
    elif candidate.triage_decision == "speaker-cleanup-passed":
        notes = "Speaker-cleanup triage passed all rows, but this focused pass is not full audio approval. Keep v006 locked until full listen passes."
    else:
        notes = "Speaker-cleanup triage notes are incomplete. Keep v006 locked and request completed notes."
    lines = [
        "OUT=" + shell_quote(str(baseline_dir)),
        "python3 apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py \\",
        "  --baseline-dir \"$OUT\" \\",
        "  --status " + shell_quote(candidate.suggested_status) + " \\",
        "  --reviewer " + shell_quote(reviewer) + " \\",
        "  --notes " + shell_quote(notes) + " \\",
    ]
    if packet:
        for issue in issue_lines(packet):
            lines.append("  --issue " + shell_quote(issue) + " \\")
    if dry_run:
        lines.append("  --dry-run")
    else:
        lines.append("  --confirm-human-listened")
    return lines


def run_dry_run(lines: list[str]) -> dict[str, Any]:
    command = "\n".join(lines)
    proc = subprocess.run(command, cwd=repo_root(), shell=True, executable="/bin/zsh", text=True, capture_output=True)
    return {"ok": proc.returncode == 0, "returncode": proc.returncode, "stdout": proc.stdout.strip(), "stderr": proc.stderr.strip(), "command": lines}


def render_markdown(report: dict[str, Any]) -> str:
    selected = report.get("selectedCandidate") or {}
    lines = [
        "# Speaker Cleanup Triage Notes Inbox",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        "",
        "This inbox finds exported notes from the speaker cleanup triage board. It does not approve the full audio spine; an all-pass focused triage clears this review slice only.",
        "",
        "## Summary",
        "",
        f"- Matching candidates: `{report['matchingCandidateCount']}`",
        f"- Ignored files: `{len(report['ignoredFiles'])}`",
        f"- Selected candidate: `{selected.get('path') or 'none'}`",
        f"- Triage decision: `{selected.get('speakerCleanupTriageDecision') or 'none'}`",
        f"- Suggested status: `{selected.get('suggestedDecisionStatus') or 'none'}`",
        f"- Decision dry-run OK: `{str((report.get('decisionDryRun') or {}).get('ok')).lower()}`",
        f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
        f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
        f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
        f"- Upload attempted: `{str(report['uploadAttempted']).lower()}`",
        f"- Publication attempted: `{str(report['publicationAttempted']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Meaning",
        "",
    ]
    if selected:
        decision = selected.get("speakerCleanupTriageDecision")
        if decision == "needs-scoped-v007-repair":
            lines.append("The triage notes found a focused speaker-cleanup problem. Keep v006 locked and route scoped v007 proof-window repair.")
        elif decision == "needs-more-proof":
            lines.append("The triage notes ask for more focused proof. Keep v006 locked and generate/listen to the requested proof before deciding.")
        elif decision == "speaker-cleanup-passed":
            lines.append("Speaker-cleanup triage passed, but full v006 audio approval still requires the broader human listen decision.")
        else:
            lines.append("The selected notes packet is incomplete. Keep v006 locked and request completed triage notes.")
    else:
        lines.append("No matching triage notes were found yet.")
    lines.extend(["", "## Candidates", "", "| File | Rows | Pass | Repair | Proof | Pending | Overall | Suggested |", "|---|---:|---:|---:|---:|---:|---|---|"])
    for item in report.get("matchingCandidates") or []:
        lines.append(
            f"| `{item['path']}` | `{item['rowCount']}` | `{item['passCount']}` | `{item['repairCount']}` | `{item['proofCount']}` | `{item['pendingCount']}` | `{item['overallDecision']}` | `{item['suggestedDecisionStatus']}` |"
        )
    if report.get("ignoredFiles"):
        lines.extend(["", "## Ignored files", ""])
        for item in report["ignoredFiles"][:20]:
            lines.append(f"- `{item.get('path')}`: {item.get('reason')}")
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--search-dir", action="append", type=Path, default=[])
    parser.add_argument("--no-default-search", action="store_true")
    parser.add_argument("--reviewer", default="Speaker Cleanup Triage Reviewer")
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    search_dirs = [] if args.no_default_search else default_search_dirs(baseline_dir)
    search_dirs.extend(args.search_dir)
    matching: list[Candidate] = []
    ignored: list[dict[str, Any]] = []
    for path in iter_json_files(search_dirs):
        candidate, issue = classify_file(path, baseline_id)
        if candidate:
            matching.append(candidate)
        elif issue:
            ignored.append(issue)
    matching.sort(key=lambda item: item.mtime, reverse=True)
    selected = matching[0] if matching else None
    selected_packet = read_json(selected.path) if selected else None
    dry_run = run_dry_run(record_command(baseline_dir=baseline_dir, candidate=selected, packet=selected_packet, reviewer=args.reviewer, dry_run=True)) if selected else None

    output_json = baseline_dir / f"speaker-cleanup-triage-notes-inbox-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"speaker-cleanup-triage-notes-inbox-{slug}-{generated_at}.md"
    stable_json = baseline_dir / "SPEAKER_CLEANUP_TRIAGE_NOTES_INBOX.json"
    stable_md = baseline_dir / "SPEAKER_CLEANUP_TRIAGE_NOTES_INBOX.md"
    report = {
        "schema": "quipsly.audio-workbench.speaker-cleanup-triage-notes-inbox.v1",
        "generatedAt": generated_at,
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "searchDirs": [str(path) for path in search_dirs],
        "matchingCandidateCount": len(matching),
        "matchingCandidates": [candidate_dict(item) for item in matching],
        "ignoredFiles": ignored,
        "selectedCandidate": candidate_dict(selected) if selected else None,
        "decisionDryRun": dry_run,
        "approvalStatus": manifest_before.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest_before.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest_before.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest_before.get("branchRenderReady")),
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
        "json": str(output_json),
        "markdown": str(output_md),
        "stableJson": str(stable_json),
        "stableMarkdown": str(stable_md),
    }
    markdown = render_markdown(report)
    for path in (output_json, stable_json):
        write_json(path, report)
    for path in (output_md, stable_md):
        path.write_text(markdown, encoding="utf-8")

    manifest_after = read_json(manifest_path)
    outputs = manifest_after.setdefault("outputs", {})
    outputs["latestSpeakerCleanupTriageNotesInbox"] = str(stable_json)
    outputs["latestSpeakerCleanupTriageNotesInboxMarkdown"] = str(stable_md)
    history = outputs.setdefault("speakerCleanupTriageNotesInboxes", [])
    if isinstance(history, list):
        history.append(str(output_json))
    manifest_after["speakerCleanupTriageNotesInboxCount"] = int(manifest_after.get("speakerCleanupTriageNotesInboxCount") or 0) + 1
    manifest_after["speakerCleanupTriageNotesInboxCandidateCount"] = len(matching)
    manifest_after["speakerCleanupTriageNotesInboxSelectedDecision"] = selected.triage_decision if selected else None
    manifest_after["speakerCleanupTriageNotesInboxSuggestedStatus"] = selected.suggested_status if selected else None
    manifest_after["speakerCleanupTriageNotesInboxDryRunOk"] = bool(dry_run and dry_run.get("ok")) if selected else None
    manifest_after["speakerCleanupTriageNotesInboxApprovalStateChanged"] = False
    manifest_after["speakerCleanupTriageNotesInboxBranchStateChanged"] = False
    manifest_after["speakerCleanupTriageNotesInboxRenderAttempted"] = False
    manifest_after["speakerCleanupTriageNotesInboxUploadAttempted"] = False
    manifest_after["speakerCleanupTriageNotesInboxPublicationAttempted"] = False
    manifest_after["speakerCleanupTriageNotesInboxOriginalMediaMutated"] = False
    write_json(manifest_path, manifest_after)
    print(json.dumps({"json": str(stable_json), "markdown": str(stable_md), "matchingCandidateCount": len(matching), "selectedCandidate": report["selectedCandidate"]}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
