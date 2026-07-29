#!/usr/bin/env python3
"""Find and route exported marker-review notes for an audio baseline.

This is a human-listen handoff helper. It scans common local export locations
for marker-review notes JSON files, verifies they match the current baseline,
and writes a report with exact guarded next commands.

It does not approve audio, fail audio, render branches, upload files, or mutate
original media. If a matching notes packet is found, this script may run the
existing notes-to-decision bridge in dry-run mode only.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


MARKER_REVIEW_SCHEMA = "quipsly.audio-workbench.marker-review-notes.v1"
APPROVAL_STATUSES = {"human-approved-for-branch-inheritance", "human-approved-for-publication"}
FAILURE_STATUSES = {"failed-human-listen", "needs-focused-proof"}


@dataclass(frozen=True)
class Candidate:
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
    return [
        home / "Downloads",
        home / "Desktop",
        baseline_dir,
    ]


def iter_json_files(search_dirs: list[Path]) -> list[Path]:
    files: list[Path] = []
    seen: set[Path] = set()
    for directory in search_dirs:
        directory = directory.expanduser()
        if not directory.exists() or not directory.is_dir():
            continue
        patterns = ["*marker-review-notes*.json", "*audio-marker-review*.json"]
        for pattern in patterns:
            for path in directory.glob(pattern):
                if path.is_file() and path.resolve() not in seen:
                    files.append(path.resolve())
                    seen.add(path.resolve())
        if (directory / "manifest.json").exists():
            for path in directory.glob("*/marker-review-notes*.json"):
                if path.is_file() and path.resolve() not in seen:
                    files.append(path.resolve())
                    seen.add(path.resolve())
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
    return explicit if explicit in {"pending-human-listen", "failed-human-listen", "needs-focused-proof"} else "pending-human-listen"


def classify_file(path: Path, baseline_id: str, template_path: Path | None, include_templates: bool) -> tuple[Candidate | None, dict[str, Any] | None]:
    try:
        packet = read_json(path)
    except Exception as exc:  # noqa: BLE001 - this is an inbox report, not a crash site.
        return None, {"path": str(path), "reason": f"not readable JSON: {exc}"}
    if packet.get("schema") != MARKER_REVIEW_SCHEMA:
        return None, {"path": str(path), "reason": f"wrong schema: {packet.get('schema')}"}
    if packet.get("baselineId") != baseline_id:
        return None, {
            "path": str(path),
            "reason": f"wrong baselineId: {packet.get('baselineId')} != {baseline_id}",
        }
    exported = bool(packet.get("exportedAt"))
    if not exported and template_path and path.resolve() == template_path.resolve() and not include_templates:
        return None, {"path": str(path), "reason": "registered blank template; waiting for exported notes"}
    if not exported and not include_templates:
        return None, {"path": str(path), "reason": "template-like notes packet without exportedAt"}
    marker_count, pass_count, needs_repair_count, needs_proof_count, undecided_count = count_marker_decisions(packet)
    return (
        Candidate(
            path=path,
            exported=exported,
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


def bridge_command(
    *,
    baseline_dir: Path,
    notes_packet: Path,
    reviewer: str,
    status: str | None = None,
    dry_run: bool = False,
    confirm: bool = False,
) -> list[str]:
    lines = [
        "OUT=" + shell_quote(str(baseline_dir)),
        "NOTES_PACKET=" + shell_quote(str(notes_packet)),
        "python3 apps/QuipslyStudio/script/audio_workbench_record_listen_decision_from_notes.py \\",
        '  --baseline-dir "$OUT" \\',
        '  --notes-packet "$NOTES_PACKET" \\',
        "  --reviewer " + shell_quote(reviewer) + " \\",
    ]
    if status:
        lines.append("  --status " + shell_quote(status) + " \\")
    if confirm:
        lines.append("  --confirm-human-listened \\")
    if dry_run:
        lines.append("  --dry-run")
    else:
        lines[-1] = lines[-1].rstrip(" \\")
    return lines


def run_bridge_dry_run(baseline_dir: Path, candidate: Candidate, reviewer: str) -> dict[str, Any]:
    confirm = candidate.suggested_status in APPROVAL_STATUSES or candidate.suggested_status in FAILURE_STATUSES
    args = [
        "python3",
        "apps/QuipslyStudio/script/audio_workbench_record_listen_decision_from_notes.py",
        "--baseline-dir",
        str(baseline_dir),
        "--notes-packet",
        str(candidate.path),
        "--reviewer",
        reviewer,
        "--status",
        candidate.suggested_status,
        "--dry-run",
    ]
    if confirm:
        args.insert(-1, "--confirm-human-listened")
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
        "mutatedApprovalState": False,
    }


def command_block(lines: list[str]) -> list[str]:
    return ["```bash", *lines, "```"]


def candidate_json(candidate: Candidate) -> dict[str, Any]:
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


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Marker Review Notes Inbox: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This inbox finds exported human marker-review notes and routes them toward the guarded decision bridge. It does not approve audio, fail audio, render branches, upload files, or mutate original media.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Matching exported candidates: `{len(report['matchingCandidates'])}`",
        f"- Ignored files: `{len(report['ignoredFiles'])}`",
        "",
    ]
    if report.get("selectedCandidate"):
        candidate = report["selectedCandidate"]
        lines.extend(
            [
                "## Selected notes packet",
                "",
                f"- Path: `{candidate['path']}`",
                f"- Suggested decision: `{candidate['suggestedDecisionStatus']}`",
                f"- Markers: `{candidate['markerCount']}`",
                f"- Pass: `{candidate['passCount']}`",
                f"- Needs repair: `{candidate['needsRepairCount']}`",
                f"- Needs proof: `{candidate['needsProofCount']}`",
                f"- Undecided: `{candidate['undecidedCount']}`",
                "",
                "## Dry-run result",
                "",
                f"- Bridge dry-run OK: `{str(report['bridgeDryRun']['ok']).lower()}`",
                f"- Return code: `{report['bridgeDryRun']['returncode']}`",
                "",
                "## If the human listen found a problem",
                "",
                *command_block(report["commands"]["recordFailure"]),
                "",
                "## If the human listen passes",
                "",
                *command_block(report["commands"]["recordApproval"]),
                "",
                "Then run the branch gate and outcome router:",
                "",
                *command_block(report["commands"]["branchGate"]),
                "",
                *command_block(report["commands"]["postListenOutcomeRouter"]),
                "",
            ]
        )
    else:
        lines.extend(
            [
                "## No exported notes found yet",
                "",
                "Open the marker review console, listen to the marked windows, export notes JSON, then rerun this inbox.",
                "",
                *command_block(report["commands"]["openMarkerReviewConsole"]),
                "",
            ]
        )
    if report["matchingCandidates"]:
        lines.extend(["## Matching candidates", ""])
        for candidate in report["matchingCandidates"]:
            lines.append(
                f"- `{candidate['path']}`: `{candidate['suggestedDecisionStatus']}`, "
                f"{candidate['passCount']} pass, {candidate['needsRepairCount']} repair, "
                f"{candidate['needsProofCount']} proof, {candidate['undecidedCount']} undecided"
            )
        lines.append("")
    if report["ignoredFiles"]:
        lines.extend(["## Ignored files", ""])
        for item in report["ignoredFiles"][:25]:
            lines.append(f"- `{item['path']}`: {item['reason']}")
        if len(report["ignoredFiles"]) > 25:
            lines.append(f"- ...and {len(report['ignoredFiles']) - 25} more")
        lines.append("")
    lines.extend(
        [
            "## Guardrail",
            "",
            "If the selected notes packet still has undecided critical markers, do not record approval. This report can make the command easy; it cannot make the listening true.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--search-dir", action="append", type=Path, default=[])
    parser.add_argument("--include-templates", action="store_true")
    parser.add_argument("--reviewer", default="Charlie or Mako")
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).isoformat()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    template_text = output_path(outputs.get("latestEditorMarkerReviewConsoleNotesTemplate"))
    template_path = Path(template_text).expanduser().resolve() if template_text else None
    search_dirs = args.search_dir or default_search_dirs(baseline_dir)

    candidates: list[Candidate] = []
    ignored: list[dict[str, Any]] = []
    for path in iter_json_files(search_dirs):
        candidate, ignored_item = classify_file(path, baseline_id, template_path, args.include_templates)
        if candidate:
            candidates.append(candidate)
        elif ignored_item:
            ignored.append(ignored_item)
    candidates.sort(key=lambda item: (item.exported, item.mtime), reverse=True)
    selected = candidates[0] if candidates else None

    commands: dict[str, Any] = {
        "openMarkerReviewConsole": [
            "open " + shell_quote(str(output_path(outputs.get("latestEditorMarkerReviewConsoleHtml")) or "")),
        ],
    }
    dry_run: dict[str, Any] | None = None
    if selected:
        dry_run = run_bridge_dry_run(baseline_dir, selected, args.reviewer)
        commands = {
            "recordFailure": bridge_command(
                baseline_dir=baseline_dir,
                notes_packet=selected.path,
                reviewer=args.reviewer,
                status="failed-human-listen",
                confirm=True,
            ),
            "recordApproval": bridge_command(
                baseline_dir=baseline_dir,
                notes_packet=selected.path,
                reviewer=args.reviewer,
                status="human-approved-for-branch-inheritance",
                confirm=True,
            ),
            "branchGate": [
                "OUT=" + shell_quote(str(baseline_dir)),
                'python3 apps/QuipslyStudio/script/audio_workbench_post_listen_refresh.py --baseline-dir "$OUT"',
            ],
            "postListenOutcomeRouter": [
                "OUT=" + shell_quote(str(baseline_dir)),
                'python3 apps/QuipslyStudio/script/audio_workbench_post_listen_outcome_router.py --baseline-dir "$OUT"',
            ],
        }

    report = {
        "schema": "quipsly.audio-workbench.marker-review-notes-inbox.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest.get("approvalStatus"),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "searchDirs": [str(path.expanduser()) for path in search_dirs],
        "matchingCandidates": [candidate_json(candidate) for candidate in candidates],
        "ignoredFiles": ignored,
        "selectedCandidate": candidate_json(selected) if selected else None,
        "bridgeDryRun": dry_run,
        "commands": commands,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }

    json_path = baseline_dir / f"audio-marker-review-notes-inbox-{slug}-{timestamp}.json"
    md_path = baseline_dir / f"audio-marker-review-notes-inbox-{slug}-{timestamp}.md"
    write_json(json_path, report)
    md_path.write_text(render_markdown(report), encoding="utf-8")

    outputs["latestMarkerReviewNotesInbox"] = str(json_path)
    outputs["latestMarkerReviewNotesInboxMarkdown"] = str(md_path)
    history = outputs.setdefault("markerReviewNotesInboxes", [])
    if str(json_path) not in history:
        history.append(str(json_path))
    manifest["markerReviewNotesInboxCount"] = len(history)
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "markdown": str(md_path),
                "json": str(json_path),
                "matchingCandidates": len(candidates),
                "selectedCandidate": str(selected.path) if selected else None,
                "bridgeDryRunOk": dry_run.get("ok") if dry_run else None,
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
