#!/usr/bin/env python3
"""Find exported listen-priority notes for an audio baseline.

The listen-priority console is the shortest human-review path through the v006
master: jump to risky moments, mark pass / needs-repair / needs-proof, then
export local JSON. This inbox finds those exported notes, verifies the baseline,
and writes the next guarded command path.

It does not approve audio, fail audio, render branches, upload files, or mutate
original media. It only creates a report and validates dry-run command shape.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


LISTEN_PRIORITY_SCHEMA = "quipsly.audio-workbench.listen-priority-notes.v1"
CONTROL_ROOM_SCHEMA = "quipsly.audio-workbench.human-listen-control-room-notes.v1"
ACCEPTED_NOTE_SCHEMAS = {LISTEN_PRIORITY_SCHEMA, CONTROL_ROOM_SCHEMA}
SAFE_STATUS_MAP = {
    "pending-human-listen": "pending-human-listen",
    "needs-proof": "needs-focused-proof",
    "needs-focused-proof": "needs-focused-proof",
    "failed-human-listen": "failed-human-listen",
    "human-approved-for-branch-inheritance": "human-approved-for-branch-inheritance",
}
CONFIRMED_STATUSES = {
    "failed-human-listen",
    "needs-focused-proof",
    "human-approved-for-branch-inheritance",
    "human-approved-for-publication",
}


@dataclass(frozen=True)
class Candidate:
    path: Path
    source_schema: str
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
    raise FileNotFoundError(
        "Could not find manifest.json at "
        f"{input_path}/manifest.json or {nested}/manifest.json"
    )


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def output_path(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        path = value.get("path")
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


def default_search_dirs(baseline_dir: Path) -> list[Path]:
    home = Path.home()
    return [home / "Downloads", home / "Desktop", baseline_dir]


def iter_json_files(search_dirs: list[Path]) -> list[Path]:
    files: list[Path] = []
    seen: set[Path] = set()
    patterns = [
        "*listen-priority-notes*.json",
        "*audio-listen-priority-notes*.json",
        "*human-listen-control-room-notes*.json",
        "*control-room-notes*.json",
        "*listen-priority*.json",
    ]
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
            for path in directory.glob("*/listen-priority*.json"):
                resolved = path.resolve()
                if path.is_file() and resolved not in seen:
                    files.append(resolved)
                    seen.add(resolved)
    return sorted(files, key=lambda item: item.stat().st_mtime if item.exists() else 0, reverse=True)


def normalized_items(packet: dict[str, Any]) -> list[dict[str, Any]]:
    schema = packet.get("schema")
    if schema == CONTROL_ROOM_SCHEMA:
        return [
            {
                "id": note.get("id") or f"control-room-note-{index}",
                "label": note.get("label") or note.get("title") or note.get("id") or f"Control room note {index}",
                "decision": note.get("decision"),
                "notes": note.get("notes") or note.get("note"),
                "kind": "human-listen-control-room-note",
            }
            for index, note in enumerate(packet.get("notes") or [], start=1)
            if isinstance(note, dict)
        ]
    return [dict(item) for item in packet.get("items") or [] if isinstance(item, dict)]


def count_item_decisions(packet: dict[str, Any]) -> tuple[int, int, int, int, int]:
    item_count = pass_count = needs_repair_count = needs_proof_count = undecided_count = 0
    for item in normalized_items(packet):
        item_count += 1
        decision = str(item.get("decision") or "undecided").strip()
        if decision == "pass":
            pass_count += 1
        elif decision in {"needs-repair", "fail", "failed"}:
            needs_repair_count += 1
        elif decision in {"needs-proof", "more-proof"}:
            needs_proof_count += 1
        else:
            undecided_count += 1
    return item_count, pass_count, needs_repair_count, needs_proof_count, undecided_count


def suggested_status(packet: dict[str, Any]) -> str:
    item_count, pass_count, needs_repair_count, needs_proof_count, undecided_count = count_item_decisions(packet)
    explicit = str(packet.get("suggestedDecision") or packet.get("suggestedOverallDecision") or "").strip()
    if needs_repair_count:
        return "failed-human-listen"
    if needs_proof_count:
        return "needs-focused-proof"
    if item_count and pass_count == item_count and not undecided_count:
        return "human-approved-for-branch-inheritance"
    return SAFE_STATUS_MAP.get(explicit, "pending-human-listen")


def classify_file(path: Path, baseline_id: str) -> tuple[Candidate | None, dict[str, Any] | None]:
    try:
        packet = read_json(path)
    except Exception as exc:  # noqa: BLE001 - inbox reports bad files instead of crashing.
        return None, {"path": str(path), "reason": f"not readable JSON: {exc}"}
    schema = str(packet.get("schema") or "")
    if schema not in ACCEPTED_NOTE_SCHEMAS:
        return None, {"path": str(path), "reason": f"unsupported schema: {packet.get('schema')}"}
    if packet.get("baselineId") != baseline_id:
        return None, {
            "path": str(path),
            "reason": f"wrong baselineId: {packet.get('baselineId')} != {baseline_id}",
        }
    exported_at = str(packet.get("exportedAt") or "").strip()
    if not exported_at:
        return None, {"path": str(path), "reason": "notes packet has no exportedAt"}
    item_count, pass_count, needs_repair_count, needs_proof_count, undecided_count = count_item_decisions(packet)
    return (
        Candidate(
            path=path,
            source_schema=schema,
            item_count=item_count,
            pass_count=pass_count,
            needs_repair_count=needs_repair_count,
            needs_proof_count=needs_proof_count,
            undecided_count=undecided_count,
            suggested_status=suggested_status(packet),
            exported_at=exported_at,
            mtime=path.stat().st_mtime,
        ),
        None,
    )


def decision_notes(candidate: Candidate) -> str:
    source_name = "human listen control room" if candidate.source_schema == CONTROL_ROOM_SCHEMA else "listen-priority console"
    if candidate.suggested_status == "human-approved-for-branch-inheritance":
        return f"Human reviewed the {source_name} export and approved v006 for edit branch inheritance."
    if candidate.suggested_status == "failed-human-listen":
        return f"{source_name.title()} notes found at least one needs-repair item; render a v007 or timestamped repair candidate instead of overwriting v006."
    if candidate.suggested_status == "needs-focused-proof":
        return f"{source_name.title()} notes requested more focused proof before branch inheritance."
    return f"{source_name.title()} notes are still pending; keep v006 locked and continue human review."


def decision_issues(packet: dict[str, Any], limit: int = 12) -> list[str]:
    issues: list[str] = []
    for item in normalized_items(packet):
        decision = str(item.get("decision") or "").strip()
        if decision not in {"needs-repair", "needs-proof", "fail", "failed", "more-proof"}:
            continue
        label = item.get("label") or item.get("title") or item.get("kind") or "listen-priority item"
        at = item.get("timecode") or item.get("startTimecode") or item.get("sequenceTimecode") or item.get("sequenceStartSeconds") or "unknown time"
        notes = item.get("notes") or "no item notes"
        issues.append(f"{at}: {label}: {decision}: {notes}")
        if len(issues) >= limit:
            issues.append("additional items omitted from command suggestion; see notes packet")
            break
    return issues


def record_command(
    *,
    baseline_dir: Path,
    candidate: Candidate,
    packet: dict[str, Any] | None,
    reviewer: str,
    dry_run: bool,
) -> list[str]:
    status = candidate.suggested_status
    notes = decision_notes(candidate)
    lines = [
        "OUT=" + shell_quote(str(baseline_dir)),
        "python3 apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py \\",
        '  --baseline-dir "$OUT" \\',
        "  --status " + shell_quote(status) + " \\",
        "  --reviewer " + shell_quote(reviewer) + " \\",
        "  --notes " + shell_quote(notes) + " \\",
    ]
    if packet:
        for issue in decision_issues(packet):
            lines.append("  --issue " + shell_quote(issue) + " \\")
    if status in CONFIRMED_STATUSES:
        lines.append("  --confirm-human-listened \\")
    if dry_run:
        lines.append("  --dry-run")
    else:
        lines[-1] = lines[-1].rstrip(" \\")
    return lines


def run_decision_dry_run(baseline_dir: Path, candidate: Candidate, packet: dict[str, Any] | None, reviewer: str) -> dict[str, Any]:
    args = [
        "python3",
        "apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py",
        "--baseline-dir",
        str(baseline_dir),
        "--status",
        candidate.suggested_status,
        "--reviewer",
        reviewer,
        "--notes",
        decision_notes(candidate),
        "--dry-run",
    ]
    if packet:
        for issue in decision_issues(packet):
            args.extend(["--issue", issue])
    if candidate.suggested_status in CONFIRMED_STATUSES:
        args.append("--confirm-human-listened")
    result = subprocess.run(args, cwd=repo_root(), text=True, capture_output=True)
    parsed: Any = None
    if result.stdout.strip():
        try:
            parsed = json.loads(result.stdout)
        except json.JSONDecodeError:
            parsed = None
    return {
        "args": args,
        "returncode": result.returncode,
        "ok": result.returncode == 0,
        "stdout": result.stdout.strip(),
        "stderr": result.stderr.strip(),
        "parsedStdout": parsed,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }


def command_block(lines: list[str]) -> list[str]:
    return ["```bash", *lines, "```"]


def candidate_json(candidate: Candidate) -> dict[str, Any]:
    return {
        "path": str(candidate.path),
        "sourceSchema": candidate.source_schema,
        "exportedAt": candidate.exported_at,
        "itemCount": candidate.item_count,
        "passCount": candidate.pass_count,
        "needsRepairCount": candidate.needs_repair_count,
        "needsProofCount": candidate.needs_proof_count,
        "undecidedCount": candidate.undecided_count,
        "suggestedDecisionStatus": candidate.suggested_status,
        "mtime": candidate.mtime,
    }


def render_markdown(report: dict[str, Any]) -> str:
    selected = report.get("selectedCandidate")
    lines = [
        "# Audio listen-priority notes inbox",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This report scans for notes exported by the listen-priority console or the human-listen control room. It does not approve audio, fail audio, render branches, upload files, or mutate original media.",
        "",
        "## Current truth",
        "",
        f"- Baseline: `{report['baselineId']}`",
        f"- Approval status before scan: `{report['approvalStatusBefore']}`",
        f"- Branch inheritance ready before scan: `{str(report['branchInheritanceReadyBefore']).lower()}`",
        f"- Branch render ready before scan: `{str(report['branchRenderReadyBefore']).lower()}`",
        f"- Matching exported notes: `{report['matchingCandidateCount']}`",
        f"- Ignored files: `{report['ignoredFileCount']}`",
        f"- Selected candidate: `{selected['path'] if selected else 'none'}`",
        "",
    ]
    if selected:
        lines.extend(
            [
                "## Selected notes summary",
                "",
                f"- Source schema: `{selected['sourceSchema']}`",
                f"- Exported at: `{selected['exportedAt']}`",
                f"- Items: `{selected['itemCount']}`",
                f"- Pass: `{selected['passCount']}`",
                f"- Needs repair: `{selected['needsRepairCount']}`",
                f"- Needs proof: `{selected['needsProofCount']}`",
                f"- Undecided: `{selected['undecidedCount']}`",
                f"- Suggested decision status: `{selected['suggestedDecisionStatus']}`",
                "",
                "## Dry-run result",
                "",
                f"- Dry-run OK: `{str((report.get('decisionDryRun') or {}).get('ok')).lower()}`",
                f"- Return code: `{(report.get('decisionDryRun') or {}).get('returncode')}`",
                "",
                "## Next safe command",
                "",
                "Run this only after a real human reviewer means to record the decision. The inbox already dry-ran the same shape when possible.",
                "",
                *command_block(report["commands"]["recordDecision"]),
                "",
            ]
        )
    else:
        lines.extend(
            [
                "## Next safe action",
                "",
                "No matching exported listen-priority/control-room notes were found. Open the listen-priority console or human-listen control room, review the queue, export notes JSON, then rerun this inbox.",
                "",
                *command_block(report["commands"]["openListenPriorityConsole"]),
                "",
                *command_block(report["commands"]["rerunInbox"]),
                "",
            ]
        )
    if report.get("ignoredFiles"):
        lines.extend(["## Ignored files", "", "| Path | Reason |", "|---|---|"])
        for item in report["ignoredFiles"][:25]:
            lines.append(f"| `{item['path']}` | {item['reason']} |")
        if len(report["ignoredFiles"]) > 25:
            lines.append(f"| ... | {len(report['ignoredFiles']) - 25} additional ignored files omitted |")
        lines.append("")
    lines.extend(
        [
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
    parser.add_argument("--search-dir", action="append", type=Path, default=[])
    parser.add_argument("--no-default-search", action="store_true")
    parser.add_argument("--reviewer", default="Charlie or Mako")
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    baseline_id = str(manifest.get("baselineId") or "unknown-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    search_dirs = ([] if args.no_default_search else default_search_dirs(baseline_dir)) + [
        path.expanduser() for path in args.search_dir
    ]
    ignored: list[dict[str, Any]] = []
    candidates: list[Candidate] = []
    for path in iter_json_files(search_dirs):
        candidate, reason = classify_file(path, baseline_id)
        if candidate:
            candidates.append(candidate)
        elif reason:
            ignored.append(reason)

    candidates = sorted(candidates, key=lambda item: item.mtime, reverse=True)
    selected = candidates[0] if candidates else None
    selected_packet = read_json(selected.path) if selected else None
    decision_dry_run = run_decision_dry_run(baseline_dir, selected, selected_packet, args.reviewer) if selected else None

    output_json = baseline_dir / f"audio-listen-priority-notes-inbox-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"audio-listen-priority-notes-inbox-{slug}-{generated_at}.md"
    commands = {
        "openListenPriorityConsole": [
            "open " + shell_quote(output_path(outputs.get("latestAudioListenPriorityConsoleHtml")) or output_path(outputs.get("latestAudioListenPriorityConsoleMarkdown")) or "")
        ],
        "rerunInbox": [
            "OUT=" + shell_quote(str(baseline_dir)),
            'python3 apps/QuipslyStudio/script/audio_workbench_listen_priority_notes_inbox.py --baseline-dir "$OUT"',
        ],
        "recordDecision": record_command(
            baseline_dir=baseline_dir,
            candidate=selected,
            packet=selected_packet,
            reviewer=args.reviewer,
            dry_run=False,
        ) if selected else [],
    }
    if commands["openListenPriorityConsole"] == ["open ''"]:
        commands["openListenPriorityConsole"] = ["echo 'No listen-priority console registered; regenerate the listen-priority console first.'"]

    report = {
        "schema": "quipsly.audio-workbench.listen-priority-notes-inbox.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatusBefore": manifest.get("approvalStatus"),
        "branchInheritanceReadyBefore": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReadyBefore": bool(manifest.get("branchRenderReady")),
        "searchDirs": [str(path) for path in search_dirs],
        "matchingCandidateCount": len(candidates),
        "ignoredFileCount": len(ignored),
        "candidates": [candidate_json(candidate) for candidate in candidates],
        "selectedCandidate": candidate_json(selected) if selected else None,
        "ignoredFiles": ignored,
        "decisionDryRun": decision_dry_run,
        "commands": commands,
        "markdown": str(output_md),
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }

    write_json(output_json, report)
    output_md.write_text(render_markdown(report) + "\n", encoding="utf-8")

    outputs["latestAudioListenPriorityNotesInbox"] = str(output_json)
    outputs["latestAudioListenPriorityNotesInboxMarkdown"] = str(output_md)
    history = outputs.setdefault("audioListenPriorityNotesInboxes", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["audioListenPriorityNotesInboxCount"] = len(history)
    write_json(manifest_path, manifest)

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "markdown": str(output_md),
                "json": str(output_json),
                "matchingCandidateCount": len(candidates),
                "selectedCandidate": str(selected.path) if selected else None,
                "ignoredFileCount": len(ignored),
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
