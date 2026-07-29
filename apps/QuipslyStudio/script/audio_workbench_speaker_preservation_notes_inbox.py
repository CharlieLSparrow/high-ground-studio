#!/usr/bin/env python3
"""Find exported speaker-preservation proof notes for an audio baseline.

The speaker preservation proof pack is a focused source-vs-master review surface.
This inbox validates exported notes and converts them into pass context, focused
proof requests, or scoped repair actions. It does not approve the full audio
spine, fail it by itself, render branches, upload files, or mutate original
media.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA = "quipsly.audio.speaker-preservation-proof-notes.v1"
REPAIR_DECISIONS = {"needs-repair", "repair", "fail", "failed"}
PROOF_DECISIONS = {"needs-proof", "more-proof", "needs-focused-proof"}
PASS_DECISIONS = {"pass", "ok", "acceptable", "preserved"}


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


def default_search_dirs(baseline_dir: Path) -> list[Path]:
    home = Path.home()
    return [home / "Downloads", home / "Desktop", baseline_dir]


def iter_json_files(search_dirs: list[Path]) -> list[Path]:
    patterns = [
        "*speaker-preservation*notes*.json",
        "*preservation-proof*notes*.json",
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
            for path in directory.glob("*/speaker-preservation*notes*.json"):
                resolved = path.resolve()
                if path.is_file() and resolved not in seen:
                    files.append(resolved)
                    seen.add(resolved)
    return sorted(files, key=lambda item: item.stat().st_mtime if item.exists() else 0, reverse=True)


def normalized_notes(packet: dict[str, Any]) -> list[dict[str, Any]]:
    rows = packet.get("notes") or packet.get("items") or []
    return [dict(item) for item in rows if isinstance(item, dict)]


def normalize_decision(value: Any) -> str:
    return str(value or "undecided").strip().lower() or "undecided"


def count_decisions(packet: dict[str, Any]) -> tuple[int, int, int, int, int]:
    item_count = pass_count = needs_repair_count = needs_proof_count = undecided_count = 0
    for item in normalized_notes(packet):
        item_count += 1
        decision = normalize_decision(item.get("decision"))
        if decision in PASS_DECISIONS:
            pass_count += 1
        elif decision in REPAIR_DECISIONS:
            needs_repair_count += 1
        elif decision in PROOF_DECISIONS:
            needs_proof_count += 1
        else:
            undecided_count += 1
    return item_count, pass_count, needs_repair_count, needs_proof_count, undecided_count


def suggested_status(packet: dict[str, Any]) -> str:
    item_count, pass_count, needs_repair_count, needs_proof_count, undecided_count = count_decisions(packet)
    if needs_repair_count:
        return "failed-human-listen"
    if needs_proof_count:
        return "needs-focused-proof"
    if item_count and pass_count == item_count and not undecided_count:
        return "pending-human-listen"
    return "pending-human-listen"


def classify_file(path: Path, baseline_id: str) -> tuple[Candidate | None, dict[str, Any] | None]:
    try:
        packet = read_json(path)
    except Exception as exc:  # noqa: BLE001
        return None, {"path": str(path), "reason": f"not readable JSON: {exc}"}
    if packet.get("schema") != SCHEMA:
        return None, {"path": str(path), "reason": f"unsupported schema: {packet.get('schema')}"}
    if packet.get("baselineId") != baseline_id:
        return None, {"path": str(path), "reason": f"wrong baselineId: {packet.get('baselineId')} != {baseline_id}"}
    exported_at = str(packet.get("exportedAt") or "").strip()
    if not exported_at:
        return None, {"path": str(path), "reason": "notes packet has no exportedAt"}
    item_count, pass_count, needs_repair_count, needs_proof_count, undecided_count = count_decisions(packet)
    return (
        Candidate(
            path=path,
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
        "exportedAt": candidate.exported_at,
        "mtime": candidate.mtime,
    }


def action_for_item(item: dict[str, Any], source_packet: Path) -> dict[str, Any] | None:
    decision = normalize_decision(item.get("decision"))
    if decision not in REPAIR_DECISIONS and decision not in PROOF_DECISIONS and decision not in PASS_DECISIONS:
        return None
    speaker = str(item.get("speaker") or "unknown")
    title = str(item.get("title") or f"{speaker} preservation check")
    timecode = str(item.get("timecode") or "unknown")
    note = str(item.get("note") or "").strip()
    base = {
        "sourceNotesPacket": str(source_packet),
        "decision": decision,
        "label": title,
        "speaker": speaker,
        "timecode": timecode,
        "sequenceStartSeconds": item.get("windowStart"),
        "durationSeconds": (float(item.get("windowEnd") or 0.0) - float(item.get("windowStart") or 0.0)) if item.get("windowEnd") is not None and item.get("windowStart") is not None else None,
        "reviewerNotes": note,
        "flags": item.get("flags") or [],
        "masterSnippet": item.get("masterSnippet"),
        "sourceSnippet": item.get("sourceSnippet"),
        "safeTreatmentPath": [
            "Keep v006 locked while this focused finding is evaluated.",
            "Compare current v006 master against aligned source and contribution evidence.",
            "If repair is real, render a scoped v007 proof window before any full baseline.",
            "Promote only after human listening prefers the candidate and no new artifacts appear.",
        ],
        "doNotDo": [
            "Do not approve the full v006 spine from this focused proof slice alone.",
            "Do not overwrite v006.",
            "Do not mutate source media.",
            "Do not unlock branch inheritance from preservation notes alone.",
        ],
    }
    if decision in REPAIR_DECISIONS:
        return {**base, "actionType": "v007-speaker-preservation-repair-required", "firstMove": "Render a scoped v007 proof candidate for this speaker/time window, then compare source vs v006 vs candidate."}
    if decision in PROOF_DECISIONS:
        return {**base, "actionType": "speaker-preservation-focused-proof-needed", "firstMove": "Render or gather more focused proof around this window before deciding whether repair is needed."}
    return {**base, "actionType": "speaker-preservation-pass-context", "firstMove": "Keep as pass context for this proof slice; full v006 approval still requires explicit human listen decision."}


def actions_from_packet(packet: dict[str, Any], source_packet: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    repair: list[dict[str, Any]] = []
    proof: list[dict[str, Any]] = []
    passed: list[dict[str, Any]] = []
    for item in normalized_notes(packet):
        action = action_for_item(item, source_packet)
        if not action:
            continue
        decision = normalize_decision(action.get("decision"))
        if decision in REPAIR_DECISIONS:
            repair.append(action)
        elif decision in PROOF_DECISIONS:
            proof.append(action)
        elif decision in PASS_DECISIONS:
            passed.append(action)
    return repair, proof, passed


def render_markdown(report: dict[str, Any]) -> str:
    selected = report.get("selectedCandidate") or {}
    lines = [
        "# Speaker Preservation Proof Notes Inbox",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        "",
        "This inbox finds exported notes from the speaker preservation proof pack. It does not approve the whole audio spine; all-pass here only clears this focused preservation proof slice.",
        "",
        "## Summary",
        "",
        f"- Matching candidates: `{report['matchingCandidateCount']}`",
        f"- Ignored files: `{len(report['ignoredFiles'])}`",
        f"- Selected candidate: `{selected.get('path') or 'none'}`",
        f"- Suggested status: `{selected.get('suggestedDecisionStatus') or 'none'}`",
        f"- Repair actions: `{report['repairActionCount']}`",
        f"- Focused proof actions: `{report['focusedProofActionCount']}`",
        f"- Pass/context actions: `{report['passContextCount']}`",
        f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
        f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
        f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Actions",
        "",
    ]
    for heading, rows in [
        ("Repair", report.get("repairActions") or []),
        ("Focused proof", report.get("focusedProofActions") or []),
        ("Pass/context", report.get("passContextActions") or []),
    ]:
        lines.append(f"### {heading}")
        lines.append("")
        if not rows:
            lines.append("- None.")
        for action in rows:
            lines.append(f"- `{action.get('timecode')}` {action.get('label')} - {action.get('decision')}: {action.get('reviewerNotes') or 'no note'}")
        lines.append("")
    lines.extend([
        "## Meaning",
        "",
        "If repair or proof actions appear here, keep v006 locked and use the exact window as the next scoped proof/repair target. If all items are pass/context, this proof surface supports human approval but does not replace the explicit full-listen approval command.",
    ])
    return "\n".join(lines) + "\n"


def update_manifest(manifest_path: Path, manifest: dict[str, Any], report: dict[str, Any]) -> None:
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioSpeakerPreservationProofNotesInbox"] = report["json"]
    outputs["latestAudioSpeakerPreservationProofNotesInboxMarkdown"] = report["markdown"]
    history = outputs.setdefault("audioSpeakerPreservationProofNotesInboxes", [])
    if isinstance(history, list) and report["json"] not in history:
        history.append(report["json"])
    md_history = outputs.setdefault("audioSpeakerPreservationProofNotesInboxMarkdowns", [])
    if isinstance(md_history, list) and report["markdown"] not in md_history:
        md_history.append(report["markdown"])
    manifest["audioSpeakerPreservationProofNotesInboxCount"] = len(outputs.get("audioSpeakerPreservationProofNotesInboxes") or [])
    manifest["audioSpeakerPreservationProofNotesInboxLatestCandidateCount"] = report["matchingCandidateCount"]
    manifest["audioSpeakerPreservationProofNotesInboxLatestRepairActionCount"] = report["repairActionCount"]
    manifest["audioSpeakerPreservationProofNotesInboxLatestFocusedProofActionCount"] = report["focusedProofActionCount"]
    manifest["audioSpeakerPreservationProofNotesInboxLatestPassContextCount"] = report["passContextCount"]
    manifest["audioSpeakerPreservationProofNotesInboxApprovalStateChanged"] = False
    manifest["audioSpeakerPreservationProofNotesInboxBranchStateChanged"] = False
    manifest["audioSpeakerPreservationProofNotesInboxRenderAttempted"] = False
    manifest["audioSpeakerPreservationProofNotesInboxOriginalMediaMutated"] = False
    manifest["updatedAt"] = datetime.now(timezone.utc).isoformat()
    write_json(manifest_path, manifest)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--search-dir", action="append", type=Path, default=[])
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    search_dirs = args.search_dir or default_search_dirs(baseline_dir)
    candidates: list[Candidate] = []
    ignored: list[dict[str, Any]] = []
    for path in iter_json_files(search_dirs):
        candidate, reason = classify_file(path, baseline_id)
        if candidate:
            candidates.append(candidate)
        elif reason:
            ignored.append(reason)

    selected = candidates[0] if candidates else None
    selected_packet: dict[str, Any] | None = read_json(selected.path) if selected else None
    repair_actions: list[dict[str, Any]] = []
    focused_proof_actions: list[dict[str, Any]] = []
    pass_context_actions: list[dict[str, Any]] = []
    if selected and selected_packet:
        repair_actions, focused_proof_actions, pass_context_actions = actions_from_packet(selected_packet, selected.path)

    output_json = baseline_dir / f"speaker-preservation-proof-notes-inbox-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"speaker-preservation-proof-notes-inbox-{slug}-{generated_at}.md"
    report = {
        "schema": "quipsly.audio.speaker-preservation-proof-notes-inbox.v1",
        "generatedAt": generated_at,
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "searchDirs": [str(path) for path in search_dirs],
        "matchingCandidateCount": len(candidates),
        "validNotesPacketCount": len(candidates),
        "ignoredFiles": ignored,
        "candidates": [candidate_dict(candidate) for candidate in candidates],
        "selectedCandidate": candidate_dict(selected) if selected else None,
        "repairActions": repair_actions,
        "focusedProofActions": focused_proof_actions,
        "passContextActions": pass_context_actions,
        "repairActionCount": len(repair_actions),
        "focusedProofActionCount": len(focused_proof_actions),
        "passContextCount": len(pass_context_actions),
        "suggestedStatus": selected.suggested_status if selected else "pending-human-listen",
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
        "json": str(output_json),
        "markdown": str(output_md),
    }
    write_json(output_json, report)
    output_md.write_text(render_markdown(report), encoding="utf-8")
    update_manifest(manifest_path, manifest, report)
    print(json.dumps({
        "baselineId": baseline_id,
        "matchingCandidateCount": report["matchingCandidateCount"],
        "repairActionCount": report["repairActionCount"],
        "focusedProofActionCount": report["focusedProofActionCount"],
        "passContextCount": report["passContextCount"],
        "markdown": str(output_md),
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
