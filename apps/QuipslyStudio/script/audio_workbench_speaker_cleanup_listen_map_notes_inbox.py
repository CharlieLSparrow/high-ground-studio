#!/usr/bin/env python3
"""Find exported speaker-cleanup listen-map notes for an audio baseline.

The speaker cleanup listen map is a focused review surface for 15 A/B windows.
This inbox validates exported notes from that page and writes the next safe
routing summary. It intentionally does not treat all-pass speaker-cleanup notes
as full audio approval, because the listen map is only one review slice.

It does not approve audio, fail audio, render branches, upload files, or mutate
original media.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA = "quipsly.audio.speaker-cleanup-listen-map-notes.v1"
SAFE_STATUS_MAP = {
    "needs-repair": "failed-human-listen",
    "needs-proof": "needs-focused-proof",
    "pass": "pending-human-listen",
    "undecided": "pending-human-listen",
}


@dataclass(frozen=True)
class Candidate:
    path: Path
    item_count: int
    pass_count: int
    needs_repair_count: int
    needs_proof_count: int
    undecided_count: int
    suggested_status: str
    speaker_cleanup_decision: str
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


def default_search_dirs(baseline_dir: Path) -> list[Path]:
    home = Path.home()
    return [home / "Downloads", home / "Desktop", baseline_dir]


def iter_json_files(search_dirs: list[Path]) -> list[Path]:
    patterns = [
        "*speaker-cleanup-listen-map-notes*.json",
        "*speaker-cleanup*notes*.json",
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


def normalized_notes(packet: dict[str, Any]) -> list[dict[str, Any]]:
    return [dict(item) for item in packet.get("notes") or [] if isinstance(item, dict)]


def count_decisions(packet: dict[str, Any]) -> tuple[int, int, int, int, int]:
    item_count = pass_count = needs_repair_count = needs_proof_count = undecided_count = 0
    for item in normalized_notes(packet):
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


def suggested_status(packet: dict[str, Any]) -> tuple[str, str]:
    item_count, pass_count, needs_repair_count, needs_proof_count, undecided_count = count_decisions(packet)
    if needs_repair_count:
        return "failed-human-listen", "needs-repair"
    if needs_proof_count:
        return "needs-focused-proof", "needs-proof"
    if item_count and pass_count == item_count and not undecided_count:
        return "pending-human-listen", "speaker-cleanup-passed"
    return "pending-human-listen", "undecided"


def classify_file(path: Path, baseline_id: str) -> tuple[Candidate | None, dict[str, Any] | None]:
    try:
        packet = read_json(path)
    except Exception as exc:  # noqa: BLE001 - inbox reports bad files instead of crashing.
        return None, {"path": str(path), "reason": f"not readable JSON: {exc}"}
    if packet.get("schema") != SCHEMA:
        return None, {"path": str(path), "reason": f"unsupported schema: {packet.get('schema')}"}
    if packet.get("baselineId") != baseline_id:
        return None, {"path": str(path), "reason": f"wrong baselineId: {packet.get('baselineId')} != {baseline_id}"}
    exported_at = str(packet.get("exportedAt") or "").strip()
    if not exported_at:
        return None, {"path": str(path), "reason": "notes packet has no exportedAt"}
    item_count, pass_count, needs_repair_count, needs_proof_count, undecided_count = count_decisions(packet)
    status, speaker_cleanup_decision = suggested_status(packet)
    return (
        Candidate(
            path=path,
            item_count=item_count,
            pass_count=pass_count,
            needs_repair_count=needs_repair_count,
            needs_proof_count=needs_proof_count,
            undecided_count=undecided_count,
            suggested_status=status,
            speaker_cleanup_decision=speaker_cleanup_decision,
            exported_at=exported_at,
            mtime=path.stat().st_mtime,
        ),
        None,
    )


def decision_issues(packet: dict[str, Any], limit: int = 15) -> list[str]:
    issues: list[str] = []
    for item in normalized_notes(packet):
        decision = str(item.get("decision") or "").strip()
        if decision not in {"needs-repair", "needs-proof", "fail", "failed", "more-proof"}:
            continue
        label = item.get("family") or item.get("timecode") or f"window {item.get('index')}"
        note = item.get("note") or "no reviewer note"
        issues.append(f"{label}: {decision}: {note}")
        if len(issues) >= limit:
            issues.append("additional speaker-cleanup items omitted from command suggestion; see notes packet")
            break
    return issues


def record_command(*, baseline_dir: Path, candidate: Candidate, packet: dict[str, Any] | None, reviewer: str, dry_run: bool) -> list[str]:
    notes = (
        "Speaker-cleanup listen map found a focus-window issue; keep v006 locked and render a scoped v007 proof candidate."
        if candidate.suggested_status != "pending-human-listen"
        else "Speaker-cleanup listen map did not find a blocking issue, but this focused pass is not full human listen approval. Keep v006 locked until full review passes."
    )
    lines = [
        "OUT=" + shell_quote(str(baseline_dir)),
        "python3 apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py \\",
        "  --baseline-dir \"$OUT\" \\",
        "  --status " + shell_quote(candidate.suggested_status) + " \\",
        "  --reviewer " + shell_quote(reviewer) + " \\",
        "  --notes " + shell_quote(notes) + " \\",
    ]
    if packet:
        for issue in decision_issues(packet):
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


def candidate_dict(candidate: Candidate) -> dict[str, Any]:
    return {
        "path": str(candidate.path),
        "sourceSchema": SCHEMA,
        "itemCount": candidate.item_count,
        "passCount": candidate.pass_count,
        "needsRepairCount": candidate.needs_repair_count,
        "needsProofCount": candidate.needs_proof_count,
        "undecidedCount": candidate.undecided_count,
        "suggestedDecisionStatus": candidate.suggested_status,
        "speakerCleanupDecision": candidate.speaker_cleanup_decision,
        "exportedAt": candidate.exported_at,
        "mtime": candidate.mtime,
    }


def render_markdown(report: dict[str, Any]) -> str:
    selected = report.get("selectedCandidate") or {}
    lines = [
        "# Speaker Cleanup Listen Map Notes Inbox",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        "",
        "This inbox finds exported notes from the speaker-cleanup listen map. It does not approve the audio spine; an all-pass focused cleanup review only clears this review slice.",
        "",
        "## Summary",
        "",
        f"- Matching candidates: `{report['matchingCandidateCount']}`",
        f"- Ignored files: `{len(report['ignoredFiles'])}`",
        f"- Selected candidate: `{selected.get('path') or 'none'}`",
        f"- Speaker-cleanup decision: `{selected.get('speakerCleanupDecision') or 'none'}`",
        f"- Suggested status: `{selected.get('suggestedDecisionStatus') or 'none'}`",
        f"- Decision dry-run OK: `{str((report.get('decisionDryRun') or {}).get('ok')).lower()}`",
        f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
        f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
        f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Meaning",
        "",
    ]
    if not selected:
        lines.append("No matching speaker-cleanup notes were found. Keep v006 locked and continue review.")
    elif selected.get("suggestedDecisionStatus") == "pending-human-listen" and selected.get("speakerCleanupDecision") == "speaker-cleanup-passed":
        lines.append("The focused speaker-cleanup pass has no blocking notes, but this is not whole-episode approval. Continue the full listen-priority/control-room review before unlocking branch inheritance.")
    elif selected.get("suggestedDecisionStatus") == "pending-human-listen":
        lines.append("The focused speaker-cleanup notes are incomplete or undecided. Keep v006 locked.")
    else:
        lines.append("The focused speaker-cleanup notes contain a blocking issue. Keep v006 locked and use the generated issue list to plan a scoped v007 proof-window repair.")
    lines.extend(["", "## Candidate table", "", "| Path | Items | Pass | Needs repair | Needs proof | Undecided | Suggested |", "|---|---:|---:|---:|---:|---:|---|"])
    for item in report["matchingCandidates"]:
        lines.append(
            f"| `{item['path']}` | {item['itemCount']} | {item['passCount']} | {item['needsRepairCount']} | {item['needsProofCount']} | {item['undecidedCount']} | `{item['suggestedDecisionStatus']}` |"
        )
    lines.extend(["", "## Dry-run command", "", "```bash", *((report.get("decisionDryRun") or {}).get("command") or ["# no command; no candidate selected"]), "```", ""])
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
    before = read_json(manifest_path)
    outputs = before.setdefault("outputs", {})
    baseline_id = str(before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    search_dirs = ([] if args.no_default_search else default_search_dirs(baseline_dir)) + [p.expanduser() for p in args.search_dir]
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
    dry_run = None
    if selected:
        dry_run = run_dry_run(record_command(baseline_dir=baseline_dir, candidate=selected, packet=selected_packet, reviewer=args.reviewer, dry_run=True))

    output_json = baseline_dir / f"speaker-cleanup-listen-map-notes-inbox-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"speaker-cleanup-listen-map-notes-inbox-{slug}-{generated_at}.md"
    report = {
        "schema": "quipsly.audio.speaker-cleanup-listen-map-notes-inbox.v1",
        "generatedAt": generated_at,
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "searchDirs": [str(path) for path in search_dirs],
        "matchingCandidateCount": len(candidates),
        "matchingCandidates": [candidate_dict(candidate) for candidate in candidates],
        "selectedCandidate": candidate_dict(selected) if selected else None,
        "ignoredFiles": ignored,
        "decisionDryRun": dry_run,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
        "markdown": str(output_md),
        "json": str(output_json),
    }
    write_json(output_json, report)
    output_md.write_text(render_markdown(report), encoding="utf-8")

    after = read_json(manifest_path)
    outputs_after = after.setdefault("outputs", {})
    outputs_after["latestSpeakerCleanupListenMapNotesInbox"] = str(output_json)
    outputs_after["latestSpeakerCleanupListenMapNotesInboxMarkdown"] = str(output_md)
    history = outputs_after.setdefault("speakerCleanupListenMapNotesInboxes", [])
    if isinstance(history, list):
        history.append(str(output_json))
    after["speakerCleanupListenMapNotesInboxCount"] = int(after.get("speakerCleanupListenMapNotesInboxCount") or 0) + 1
    after["speakerCleanupListenMapNotesMatchingCandidateCount"] = len(candidates)
    after["approvalStatus"] = before.get("approvalStatus")
    after["packageReadyForHumanListen"] = bool(before.get("packageReadyForHumanListen"))
    after["branchInheritanceReady"] = bool(before.get("branchInheritanceReady"))
    after["branchRenderReady"] = bool(before.get("branchRenderReady"))
    write_json(manifest_path, after)

    print(json.dumps({"json": str(output_json), "markdown": str(output_md), "matchingCandidateCount": len(candidates), "selectedCandidate": report["selectedCandidate"]}, indent=2))


if __name__ == "__main__":
    main()
