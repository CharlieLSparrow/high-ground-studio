#!/usr/bin/env python3
"""Generate a current-state audio review status board.

This is a non-approval control-room artifact. It summarizes manifest gate truth,
looks for exported marker-review notes, and writes stable/timestamped status
files plus a rerunnable .command launcher.

It does not approve audio, fail audio, render branches, upload files, or mutate
original media. It only updates manifest pointers to this status-board artifact.
"""

from __future__ import annotations

import argparse
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


MARKER_REVIEW_SCHEMA = "quipsly.audio-workbench.marker-review-notes.v1"


@dataclass(frozen=True)
class NotesCandidate:
    path: Path
    exported: bool
    marker_count: int
    pass_count: int
    needs_repair_count: int
    needs_proof_count: int
    undecided_count: int
    suggested_status: str
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


def output_path(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        path = value.get("path")
        if isinstance(path, str):
            return path
    return None


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def default_search_dirs(baseline_dir: Path) -> list[Path]:
    home = Path.home()
    return [home / "Downloads", home / "Desktop", baseline_dir]


def iter_json_files(search_dirs: list[Path]) -> list[Path]:
    files: list[Path] = []
    seen: set[Path] = set()
    for directory in search_dirs:
        directory = directory.expanduser()
        if not directory.exists() or not directory.is_dir():
            continue
        for pattern in ("*marker-review-notes*.json", "*audio-marker-review*.json"):
            for path in directory.glob(pattern):
                resolved = path.resolve()
                if path.is_file() and resolved not in seen:
                    files.append(resolved)
                    seen.add(resolved)
        if (directory / "manifest.json").exists():
            for path in directory.glob("*/marker-review-notes*.json"):
                resolved = path.resolve()
                if path.is_file() and resolved not in seen:
                    files.append(resolved)
                    seen.add(resolved)
    return sorted(files, key=lambda item: item.stat().st_mtime if item.exists() else 0, reverse=True)


def count_marker_decisions(packet: dict[str, Any]) -> tuple[int, int, int, int, int]:
    marker_count = pass_count = needs_repair_count = needs_proof_count = undecided_count = 0
    for marker in packet.get("markers") or []:
        marker_count += 1
        decision = str(marker.get("decision") or "undecided").strip()
        if decision == "pass":
            pass_count += 1
        elif decision in {"needs-repair", "fail", "failed"}:
            needs_repair_count += 1
        elif decision in {"more-proof", "needs-proof"}:
            needs_proof_count += 1
        else:
            undecided_count += 1
    return marker_count, pass_count, needs_repair_count, needs_proof_count, undecided_count


def suggested_status(packet: dict[str, Any]) -> str:
    marker_count, pass_count, needs_repair_count, needs_proof_count, undecided_count = count_marker_decisions(packet)
    explicit = str(packet.get("suggestedDecision") or "").strip()
    if needs_repair_count:
        return "failed-human-listen"
    if needs_proof_count:
        return "needs-focused-proof"
    if marker_count and pass_count == marker_count and not undecided_count:
        return "human-approved-for-branch-inheritance"
    if explicit in {"pending-human-listen", "failed-human-listen", "needs-focused-proof"}:
        return explicit
    return "pending-human-listen"


def classify_notes_file(
    path: Path,
    *,
    baseline_id: str,
    template_path: Path | None,
) -> tuple[NotesCandidate | None, dict[str, str] | None]:
    try:
        packet = read_json(path)
    except Exception as exc:  # noqa: BLE001 - status board should report, not crash.
        return None, {"path": str(path), "reason": f"not readable JSON: {exc}"}
    if packet.get("schema") != MARKER_REVIEW_SCHEMA:
        return None, {"path": str(path), "reason": f"wrong schema: {packet.get('schema')}"}
    if packet.get("baselineId") != baseline_id:
        return None, {
            "path": str(path),
            "reason": f"wrong baselineId: {packet.get('baselineId')} != {baseline_id}",
        }
    if template_path and path.resolve() == template_path.resolve() and not packet.get("exportedAt"):
        return None, {"path": str(path), "reason": "registered blank template; waiting for exported notes"}
    if not packet.get("exportedAt"):
        return None, {"path": str(path), "reason": "notes packet has no exportedAt"}
    marker_count, pass_count, needs_repair_count, needs_proof_count, undecided_count = count_marker_decisions(packet)
    return (
        NotesCandidate(
            path=path,
            exported=True,
            marker_count=marker_count,
            pass_count=pass_count,
            needs_repair_count=needs_repair_count,
            needs_proof_count=needs_proof_count,
            undecided_count=undecided_count,
            suggested_status=suggested_status(packet),
            mtime=path.stat().st_mtime,
        ),
        None,
    )


def candidate_json(candidate: NotesCandidate) -> dict[str, Any]:
    return {
        "path": str(candidate.path),
        "exported": candidate.exported,
        "markerCount": candidate.marker_count,
        "passCount": candidate.pass_count,
        "needsRepairCount": candidate.needs_repair_count,
        "needsProofCount": candidate.needs_proof_count,
        "undecidedCount": candidate.undecided_count,
        "suggestedDecisionStatus": candidate.suggested_status,
        "mtime": candidate.mtime,
    }


def review_state(manifest: dict[str, Any], selected: NotesCandidate | None) -> str:
    approval_status = str(manifest.get("approvalStatus") or "unknown")
    if approval_status in {"human-approved-for-branch-inheritance", "human-approved-for-publication"}:
        return "human-approved"
    if approval_status in {"failed-human-listen", "needs-focused-proof"}:
        return "human-listen-failed"
    if not selected:
        return "waiting-for-human-notes"
    if selected.needs_repair_count:
        return "exported-notes-say-repair-needed"
    if selected.needs_proof_count:
        return "exported-notes-say-more-proof-needed"
    if selected.marker_count and selected.pass_count == selected.marker_count and not selected.undecided_count:
        return "exported-notes-ready-for-guarded-approval"
    return "exported-notes-incomplete"


def bridge_command(
    *,
    baseline_dir: Path,
    notes_packet: Path,
    reviewer: str,
    status: str,
    confirm: bool,
    dry_run: bool,
) -> list[str]:
    lines = [
        "OUT=" + shell_quote(str(baseline_dir)),
        "NOTES_PACKET=" + shell_quote(str(notes_packet)),
        "python3 apps/QuipslyStudio/script/audio_workbench_record_listen_decision_from_notes.py \\",
        '  --baseline-dir "$OUT" \\',
        '  --notes-packet "$NOTES_PACKET" \\',
        "  --reviewer " + shell_quote(reviewer) + " \\",
        "  --status " + shell_quote(status) + " \\",
    ]
    if confirm:
        lines.append("  --confirm-human-listened \\")
    if dry_run:
        lines.append("  --dry-run")
    else:
        lines[-1] = lines[-1].rstrip(" \\")
    return lines


def command_block(lines: list[str]) -> list[str]:
    return ["```bash", *lines, "```"]


def build_commands(baseline_dir: Path, paths: dict[str, str | None], selected: NotesCandidate | None) -> dict[str, list[str]]:
    commands = {
        "openStartHere": ["open " + shell_quote(paths.get("startHereMarkdown") or "")],
        "openMarkerConsole": ["open " + shell_quote(paths.get("markerReviewConsole") or "")],
        "runNotesInbox": [
            "OUT=" + shell_quote(str(baseline_dir)),
            'python3 apps/QuipslyStudio/script/audio_workbench_marker_review_notes_inbox.py --baseline-dir "$OUT"',
        ],
        "rerunStatusBoard": [
            "OUT=" + shell_quote(str(baseline_dir)),
            'python3 apps/QuipslyStudio/script/audio_workbench_review_status_board.py --baseline-dir "$OUT"',
        ],
    }
    if selected:
        confirm = selected.suggested_status in {
            "human-approved-for-branch-inheritance",
            "failed-human-listen",
            "needs-focused-proof",
        }
        commands["dryRunSelectedNotes"] = bridge_command(
            baseline_dir=baseline_dir,
            notes_packet=selected.path,
            reviewer="Charlie or Mako",
            status=selected.suggested_status,
            confirm=confirm,
            dry_run=True,
        )
        commands["recordSelectedNotesDecision"] = bridge_command(
            baseline_dir=baseline_dir,
            notes_packet=selected.path,
            reviewer="Charlie or Mako",
            status=selected.suggested_status,
            confirm=confirm,
            dry_run=False,
        )
    return commands


def next_action_for(state: str) -> str:
    if state == "human-approved":
        return "Human approval is already recorded. Run the branch gate/preflight path before real branch renders."
    if state == "human-listen-failed":
        return "Human listening already failed or requested more proof. Follow the repair workorder and create a v007/timestamped repair candidate."
    if state == "exported-notes-ready-for-guarded-approval":
        return "Exported notes indicate every marker passed. Dry-run the notes bridge, then record guarded approval only if a human really listened."
    if state == "exported-notes-say-repair-needed":
        return "Exported notes indicate a real repair is needed. Dry-run the notes bridge, then record guarded failure and make a v007 repair candidate."
    if state == "exported-notes-say-more-proof-needed":
        return "Exported notes ask for more proof. Route through guarded failure/needs-proof, then render focused proof instead of full branches."
    if state == "exported-notes-incomplete":
        return "Exported notes are present but incomplete. Reopen the marker console, finish undecided markers, export again, and rerun this board."
    return "No exported human notes were found. Open START_HERE or the marker console, listen, export notes JSON, then rerun this board."


def build_markdown(report: dict[str, Any]) -> str:
    selected = report.get("selectedCandidate")
    lines = [
        "# Episode 4 Audio Review Status",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This status board is the current-control-room view for the v006 audio candidate. It does not approve audio, fail audio, render branches, upload files, or mutate source media.",
        "",
        "## Current gate truth",
        "",
        f"- Baseline: `{report['baselineId']}`",
        f"- Review state: `{report['reviewState']}`",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Matching exported notes: `{len(report['matchingCandidates'])}`",
        f"- Ignored note files: `{len(report['ignoredFiles'])}`",
        "",
        "## Next safest action",
        "",
        report["nextSafestAction"],
        "",
    ]
    if selected:
        lines.extend(
            [
                "## Selected exported notes",
                "",
                f"- Path: `{selected['path']}`",
                f"- Suggested status: `{selected['suggestedDecisionStatus']}`",
                f"- Markers: `{selected['markerCount']}`",
                f"- Pass: `{selected['passCount']}`",
                f"- Needs repair: `{selected['needsRepairCount']}`",
                f"- Needs proof: `{selected['needsProofCount']}`",
                f"- Undecided: `{selected['undecidedCount']}`",
                "",
                "Dry-run the selected notes:",
                "",
                *command_block(report["commands"]["dryRunSelectedNotes"]),
                "",
                "Record the selected notes decision only after real human listening:",
                "",
                *command_block(report["commands"]["recordSelectedNotesDecision"]),
                "",
            ]
        )
    else:
        lines.extend(
            [
                "## No exported notes selected yet",
                "",
                "Open the review front door or marker console, listen, export notes JSON, then rerun this board.",
                "",
                "Open START_HERE:",
                "",
                *command_block(report["commands"]["openStartHere"]),
                "",
                "Open marker console:",
                "",
                *command_block(report["commands"]["openMarkerConsole"]),
                "",
            ]
        )
    lines.extend(
        [
            "## Refresh commands",
            "",
            "Run the notes inbox:",
            "",
            *command_block(report["commands"]["runNotesInbox"]),
            "",
            "Regenerate this status board:",
            "",
            *command_block(report["commands"]["rerunStatusBoard"]),
            "",
            "## Guardrail",
            "",
            "Branch rendering remains locked until a real human listen decision is recorded through the guarded command path. This board is allowed to make that path obvious; it is not allowed to pretend the listen happened.",
            "",
        ]
    )
    if report["ignoredFiles"]:
        lines.extend(["## Ignored candidate files", ""])
        for ignored in report["ignoredFiles"][:20]:
            lines.append(f"- `{ignored['path']}`: {ignored['reason']}")
        lines.append("")
    return "\n".join(lines)


def build_status_command(baseline_dir: Path) -> str:
    lines = [
        "#!/bin/zsh",
        "set -euo pipefail",
        "cd " + shell_quote(str(repo_root())),
        "OUT=" + shell_quote(str(baseline_dir)),
        'python3 apps/QuipslyStudio/script/audio_workbench_review_status_board.py --baseline-dir "$OUT"',
        'open "$OUT/EPISODE_4_AUDIO_REVIEW_STATUS.md"',
    ]
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--search-dir", action="append", type=Path, default=[])
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    generated_iso = datetime.now(timezone.utc).isoformat()
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))

    template_path_value = output_path(outputs.get("latestEditorMarkerReviewConsoleNotesTemplate"))
    template_path = Path(template_path_value).resolve() if template_path_value else None
    search_dirs = args.search_dir or default_search_dirs(baseline_dir)
    matching: list[NotesCandidate] = []
    ignored: list[dict[str, str]] = []
    for path in iter_json_files(search_dirs):
        candidate, ignore = classify_notes_file(path, baseline_id=baseline_id, template_path=template_path)
        if candidate:
            matching.append(candidate)
        elif ignore:
            ignored.append(ignore)
    selected = matching[0] if matching else None
    state = review_state(manifest, selected)

    paths = {
        "startHereMarkdown": output_path(outputs.get("latestAudioReviewStartHereMarkdown")),
        "markerReviewConsole": output_path(outputs.get("latestEditorMarkerReviewConsoleHtml")),
        "handoffIndex": output_path(outputs.get("latestReviewHandoffIndexMarkdown")),
        "reviewCockpit": output_path(outputs.get("audioReviewCockpitHtml")),
        "masterM4a": output_path(outputs.get("masterM4a")),
        "masterWav": output_path(outputs.get("masterWav")),
    }
    commands = build_commands(baseline_dir, paths, selected)
    report = {
        "schema": "quipsly.audio-workbench.review-status-board.v1",
        "generatedAt": generated_iso,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "reviewState": state,
        "nextSafestAction": next_action_for(state),
        "paths": paths,
        "searchDirs": [str(path.expanduser()) for path in search_dirs],
        "matchingCandidates": [candidate_json(candidate) for candidate in matching],
        "selectedCandidate": candidate_json(selected) if selected else None,
        "ignoredFiles": ignored,
        "commands": commands,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }

    timestamped_json = baseline_dir / f"audio-review-status-board-{slug}-{generated_at}.json"
    timestamped_md = baseline_dir / f"audio-review-status-board-{slug}-{generated_at}.md"
    stable_json = baseline_dir / "EPISODE_4_AUDIO_REVIEW_STATUS.json"
    stable_md = baseline_dir / "EPISODE_4_AUDIO_REVIEW_STATUS.md"
    command_path = baseline_dir / "CHECK_EPISODE_4_AUDIO_REVIEW_STATUS.command"
    report["timestampedJson"] = str(timestamped_json)
    report["timestampedMarkdown"] = str(timestamped_md)
    report["stableJson"] = str(stable_json)
    report["stableMarkdown"] = str(stable_md)
    report["statusCommand"] = str(command_path)

    markdown = build_markdown(report)
    write_json(timestamped_json, report)
    timestamped_md.write_text(markdown, encoding="utf-8")
    write_json(stable_json, report)
    stable_md.write_text(markdown, encoding="utf-8")
    command_path.write_text(build_status_command(baseline_dir), encoding="utf-8")
    os.chmod(command_path, 0o755)

    outputs["latestAudioReviewStatusBoard"] = str(timestamped_json)
    outputs["latestAudioReviewStatusBoardMarkdown"] = str(timestamped_md)
    outputs["latestAudioReviewStatusBoardStableJson"] = str(stable_json)
    outputs["latestAudioReviewStatusBoardStableMarkdown"] = str(stable_md)
    outputs["latestAudioReviewStatusCheckCommand"] = str(command_path)
    history = outputs.setdefault("audioReviewStatusBoards", [])
    if str(timestamped_json) not in history:
        history.append(str(timestamped_json))
    manifest["audioReviewStatusBoardCount"] = len(history)
    manifest["latestAudioReviewStatusBoardGeneratedAt"] = generated_iso
    write_json(manifest_path, manifest)

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "reviewState": state,
                "matchingCandidates": len(matching),
                "selectedCandidate": str(selected.path) if selected else None,
                "stableMarkdown": str(stable_md),
                "statusCommand": str(command_path),
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
