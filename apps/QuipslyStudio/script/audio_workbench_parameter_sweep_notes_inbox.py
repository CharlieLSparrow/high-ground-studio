#!/usr/bin/env python3
"""Find exported parameter-sweep proof snippet notes for an audio baseline.

The parameter sweep proof snippet pack lets reviewers audition controlled,
derived A/B snippets for risky audio knobs. This inbox validates exported notes
and turns selected winning variants into scoped v007 proof-candidate guidance.

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


SCHEMA = "quipsly.audio-workbench.parameter-sweep-proof-snippet-notes.v1"
WIN_DECISIONS = {"winner", "preferred", "use-this", "promote-to-proof", "selected"}
REPAIR_DECISIONS = {"needs-repair", "fail", "failed"}
PROOF_DECISIONS = {"needs-proof", "more-proof", "needs-focused-proof"}
PASS_DECISIONS = {"pass", "ok", "acceptable"}


@dataclass(frozen=True)
class Candidate:
    path: Path
    item_count: int
    winner_count: int
    needs_repair_count: int
    needs_proof_count: int
    pass_count: int
    undecided_count: int
    suggested_status: str
    selected_variant_count: int
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


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in ("path", "markdownPath", "htmlPath", "openCommand"):
            path = value.get(key)
            if isinstance(path, str) and path:
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
        "*parameter-sweep*notes*.json",
        "*sweep-proof*notes*.json",
        "*proof-snippet*notes*.json",
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
        if (directory / "manifest.json").exists():
            for path in directory.glob("*/parameter-sweep*notes*.json"):
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


def count_decisions(packet: dict[str, Any]) -> tuple[int, int, int, int, int, int]:
    item_count = winner_count = needs_repair_count = needs_proof_count = pass_count = undecided_count = 0
    for item in normalized_items(packet):
        item_count += 1
        decision = normalize_decision(item.get("decision"))
        if decision in WIN_DECISIONS:
            winner_count += 1
        elif decision in REPAIR_DECISIONS:
            needs_repair_count += 1
        elif decision in PROOF_DECISIONS:
            needs_proof_count += 1
        elif decision in PASS_DECISIONS:
            pass_count += 1
        else:
            undecided_count += 1
    return item_count, winner_count, needs_repair_count, needs_proof_count, pass_count, undecided_count


def suggested_status(packet: dict[str, Any]) -> str:
    item_count, winner_count, needs_repair_count, needs_proof_count, _pass_count, _undecided_count = count_decisions(packet)
    if needs_repair_count:
        return "failed-human-listen"
    if winner_count or needs_proof_count:
        return "needs-focused-proof"
    if item_count:
        return "pending-human-listen"
    return "pending-human-listen"


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
    item_count, winner_count, needs_repair_count, needs_proof_count, pass_count, undecided_count = count_decisions(packet)
    return (
        Candidate(
            path=path,
            item_count=item_count,
            winner_count=winner_count,
            needs_repair_count=needs_repair_count,
            needs_proof_count=needs_proof_count,
            pass_count=pass_count,
            undecided_count=undecided_count,
            suggested_status=suggested_status(packet),
            selected_variant_count=winner_count,
            exported_at=exported_at,
            mtime=path.stat().st_mtime,
        ),
        None,
    )


def selected_items(packet: dict[str, Any]) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []
    for item in normalized_items(packet):
        decision = normalize_decision(item.get("decision"))
        if decision in WIN_DECISIONS or decision in REPAIR_DECISIONS or decision in PROOF_DECISIONS:
            selected.append(item)
    return selected


def action_for_item(item: dict[str, Any]) -> dict[str, Any]:
    decision = normalize_decision(item.get("decision"))
    plan_id = str(item.get("planId") or "unknown-plan")
    variant_id = str(item.get("variantId") or "unknown-variant")
    timecode = str(item.get("timecode") or item.get("windowTimecode") or "unknown")
    label = str(item.get("label") or item.get("planTitle") or plan_id)
    note = str(item.get("note") or item.get("notes") or "").strip()
    if decision in WIN_DECISIONS:
        action_type = "v007-proof-candidate-from-sweep-winner"
        first_move = "Implement the real owning-stage repair renderer for this variant family, then render a timestamped v007 proof candidate."
    elif decision in REPAIR_DECISIONS:
        action_type = "v007-repair-required"
        first_move = "Record failed human listen if this was a real full-review finding, then render scoped proof candidates before a full baseline."
    elif decision in PROOF_DECISIONS:
        action_type = "focused-proof-needed"
        first_move = "Render more focused proof around this plan/window before deciding whether to repair."
    else:
        action_type = "context-only"
        first_move = "Keep as context only."
    return {
        "actionType": action_type,
        "planId": plan_id,
        "variantId": variant_id,
        "decision": decision,
        "label": label,
        "timecode": timecode,
        "reviewerNotes": note,
        "firstMove": first_move,
        "safeTreatmentPath": [
            "Keep v006 locked while this is evaluated.",
            "Use the owning stage from the parameter sweep plan, not a full-pipeline guess.",
            "Render current-v006 vs candidate proof windows before full-length v007 audio.",
            "Promote only after human listening prefers the candidate and no new artifacts appear.",
        ],
        "doNotDo": [
            "Do not promote proof snippets directly to a production baseline.",
            "Do not overwrite v006.",
            "Do not mutate source media.",
            "Do not unlock branch inheritance from a sweep preference alone.",
        ],
    }


def candidate_dict(candidate: Candidate) -> dict[str, Any]:
    return {
        "path": str(candidate.path),
        "sourceSchema": SCHEMA,
        "exportedAt": candidate.exported_at,
        "itemCount": candidate.item_count,
        "winnerCount": candidate.winner_count,
        "needsRepairCount": candidate.needs_repair_count,
        "needsProofCount": candidate.needs_proof_count,
        "passCount": candidate.pass_count,
        "undecidedCount": candidate.undecided_count,
        "selectedVariantCount": candidate.selected_variant_count,
        "suggestedDecisionStatus": candidate.suggested_status,
        "mtime": candidate.mtime,
    }


def command_lines_for_next_step(baseline_dir: Path, actions: list[dict[str, Any]]) -> list[str]:
    if not actions:
        return ["# No selected sweep variants found. Keep v006 locked and continue listening."]
    lines = [
        "OUT=" + shell_quote(str(baseline_dir)),
        "# Review the selected sweep actions before rendering any v007 proof candidate.",
        'python3 apps/QuipslyStudio/script/audio_workbench_parameter_sweep_notes_inbox.py --baseline-dir "$OUT"',
        "# Then implement/render the owning-stage proof candidate named in the inbox report.",
    ]
    return lines


def render_markdown(report: dict[str, Any]) -> str:
    selected = report.get("selectedCandidate") or {}
    lines = [
        "# Parameter Sweep Proof Snippet Notes Inbox",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This inbox finds exported notes from the parameter sweep proof snippet pack. It turns selected variants into scoped v007 proof-candidate guidance. It does not approve v006, fail v006 by itself, render branches, upload files, or mutate source media.",
        "",
        "## Current truth",
        "",
        f"- Baseline: `{report['baselineId']}`",
        f"- Approval status before scan: `{report['approvalStatusBefore']}`",
        f"- Branch inheritance ready before scan: `{str(report['branchInheritanceReadyBefore']).lower()}`",
        f"- Branch render ready before scan: `{str(report['branchRenderReadyBefore']).lower()}`",
        f"- Matching notes packets: `{report['matchingCandidateCount']}`",
        f"- Ignored files: `{len(report['ignoredFiles'])}`",
        f"- Selected candidate: `{selected.get('path') or 'none'}`",
        f"- Suggested status: `{selected.get('suggestedDecisionStatus') or 'none'}`",
        "",
        "## Candidate table",
        "",
        "| Path | Items | Winners | Needs repair | Needs proof | Pass | Undecided | Suggested |",
        "|---|---:|---:|---:|---:|---:|---:|---|",
    ]
    for candidate in report["matchingCandidates"]:
        lines.append(
            f"| `{candidate['path']}` | {candidate['itemCount']} | {candidate['winnerCount']} | {candidate['needsRepairCount']} | {candidate['needsProofCount']} | {candidate['passCount']} | {candidate['undecidedCount']} | `{candidate['suggestedDecisionStatus']}` |"
        )
    if report["repairActions"]:
        lines.extend(["", "## Scoped v007 / focused-proof actions", ""])
        for index, action in enumerate(report["repairActions"], start=1):
            lines.extend([
                f"### {index}. {action['label']}",
                "",
                f"- Type: `{action['actionType']}`",
                f"- Plan: `{action['planId']}`",
                f"- Variant: `{action['variantId']}`",
                f"- Decision: `{action['decision']}`",
                f"- Time: `{action['timecode']}`",
                f"- Reviewer notes: {action['reviewerNotes'] or '_none_'}",
                f"- First move: {action['firstMove']}",
                "",
                "Safe treatment path:",
                "",
                *[f"- {step}" for step in action["safeTreatmentPath"]],
                "",
            ])
    else:
        lines.extend(["", "## No selected sweep variants yet", "", "No matching notes selected a sweep winner or repair path. Keep v006 locked and continue listening.", ""])
    lines.extend([
        "## Next command shape",
        "",
        "```bash",
        *report["nextCommand"],
        "```",
        "",
        "## Guardrails",
        "",
        f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
        f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
        f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
    ])
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
    outputs = before.setdefault("outputs", {})
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

    output_json = baseline_dir / f"parameter-sweep-proof-snippet-notes-inbox-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"parameter-sweep-proof-snippet-notes-inbox-{slug}-{generated_at}.md"
    report = {
        "schema": "quipsly.audio-workbench.parameter-sweep-proof-snippet-notes-inbox.v1",
        "generatedAt": generated_at,
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "searchDirs": [str(path) for path in search_dirs],
        "approvalStatusBefore": before.get("approvalStatus"),
        "branchInheritanceReadyBefore": bool(before.get("branchInheritanceReady")),
        "branchRenderReadyBefore": bool(before.get("branchRenderReady")),
        "matchingCandidateCount": len(candidates),
        "matchingCandidates": [candidate_dict(candidate) for candidate in candidates],
        "selectedCandidate": candidate_dict(selected) if selected else None,
        "ignoredFiles": ignored,
        "repairActions": actions,
        "repairActionCount": sum(1 for action in actions if action["actionType"] in {"v007-proof-candidate-from-sweep-winner", "v007-repair-required"}),
        "focusedProofActionCount": sum(1 for action in actions if action["actionType"] == "focused-proof-needed"),
        "nextCommand": command_lines_for_next_step(baseline_dir, actions),
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
    outputs_after["latestAudioWorkbenchParameterSweepNotesInbox"] = str(output_json)
    outputs_after["latestAudioWorkbenchParameterSweepNotesInboxMarkdown"] = str(output_md)
    history = outputs_after.setdefault("audioWorkbenchParameterSweepNotesInboxHistory", [])
    if isinstance(history, list):
        history.append(str(output_json))
    after["audioWorkbenchParameterSweepNotesInboxCount"] = int(after.get("audioWorkbenchParameterSweepNotesInboxCount") or 0) + 1
    after["audioWorkbenchParameterSweepNotesInboxLatestCandidateCount"] = len(candidates)
    after["audioWorkbenchParameterSweepNotesInboxLatestActionCount"] = len(actions)
    after["approvalStatus"] = before.get("approvalStatus")
    after["packageReadyForHumanListen"] = bool(before.get("packageReadyForHumanListen"))
    after["branchInheritanceReady"] = bool(before.get("branchInheritanceReady"))
    after["branchRenderReady"] = bool(before.get("branchRenderReady"))
    write_json(manifest_path, after)

    print(json.dumps({
        "baselineId": baseline_id,
        "json": str(output_json),
        "markdown": str(output_md),
        "matchingCandidateCount": len(candidates),
        "repairActionCount": report["repairActionCount"],
        "focusedProofActionCount": report["focusedProofActionCount"],
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
