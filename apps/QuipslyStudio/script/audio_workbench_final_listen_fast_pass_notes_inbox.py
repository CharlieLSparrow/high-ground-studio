#!/usr/bin/env python3
"""Find exported final-listen fast-pass notes for an audio baseline."""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA = "quipsly.audio.final-listen-fast-pass-notes.v1"
REPAIR_DECISIONS = {"needs-repair", "repair", "fail", "failed"}
PROOF_DECISIONS = {"needs-proof", "more-proof", "needs-focused-proof"}
PASS_DECISIONS = {"pass", "ok", "acceptable", "sounds-good"}


@dataclass(frozen=True)
class Candidate:
    path: Path
    item_count: int
    pass_count: int
    needs_repair_count: int
    needs_proof_count: int
    undecided_count: int
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


def default_search_dirs(baseline_dir: Path) -> list[Path]:
    home = Path.home()
    return [home / "Downloads", home / "Desktop", baseline_dir]


def iter_json_files(search_dirs: list[Path]) -> list[Path]:
    patterns = [
        "*final-listen-fast-pass*notes*.json",
        "*final*fast*pass*notes*.json",
        "*fast-pass*notes*.json",
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
            for path in directory.glob("*/final-listen-fast-pass*notes*.json"):
                resolved = path.resolve()
                if path.is_file() and resolved not in seen:
                    files.append(resolved)
                    seen.add(resolved)
    return sorted(files, key=lambda item: item.stat().st_mtime if item.exists() else 0, reverse=True)


def normalize_decision(value: Any) -> str:
    return str(value or "undecided").strip().lower() or "undecided"


def normalized_notes(packet: dict[str, Any]) -> list[dict[str, Any]]:
    rows = packet.get("notes") or packet.get("items") or []
    return [dict(item) for item in rows if isinstance(item, dict)]


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
        "exportedAt": candidate.exported_at,
        "mtime": candidate.mtime,
    }


def seconds_to_timecode(seconds: Any) -> str:
    try:
        value = float(seconds)
    except (TypeError, ValueError):
        return "unknown"
    hours = int(value // 3600)
    minutes = int((value % 3600) // 60)
    secs = value % 60
    return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"


def action_for_item(item: dict[str, Any], source_packet: Path) -> dict[str, Any] | None:
    decision = normalize_decision(item.get("decision"))
    if decision not in REPAIR_DECISIONS and decision not in PROOF_DECISIONS and decision not in PASS_DECISIONS:
        return None
    title = str(item.get("title") or item.get("itemId") or "Final listen fast-pass item")
    timecode = str(item.get("timecode") or seconds_to_timecode(item.get("timeSec")))
    note = str(item.get("note") or "").strip()
    base = {
        "sourceNotesPacket": str(source_packet),
        "decision": decision,
        "label": title,
        "timecode": timecode,
        "sequenceStartSeconds": item.get("timeSec"),
        "category": item.get("category"),
        "severity": item.get("severity"),
        "reviewerNotes": note,
        "sourceTags": item.get("sourceTags") or [],
        "safeTreatmentPath": [
            "Keep v006 locked while final-listen notes are routed.",
            "Use the post-review action queue before creating any v007 candidate.",
            "If repair is real, render only a scoped timestamped proof candidate first.",
            "Do not unlock branch inheritance from fast-pass notes alone.",
        ],
        "doNotDo": [
            "Do not approve the full v006 spine from fast-pass notes alone.",
            "Do not overwrite v006.",
            "Do not mutate source media.",
            "Do not render publication branches from this inbox alone.",
        ],
    }
    if decision in REPAIR_DECISIONS:
        return {**base, "actionType": "v007-final-listen-repair-required", "firstMove": "Route this exact time window into the owning repair/tuning stage."}
    if decision in PROOF_DECISIONS:
        return {**base, "actionType": "final-listen-focused-proof-needed", "firstMove": "Render or inspect focused proof around this time before pass/fail."}
    return {**base, "actionType": "final-listen-pass-context", "firstMove": "Preserve as pass context only; full approval still needs explicit human listen decision."}


def build_actions(candidate: Candidate | None) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    if candidate is None:
        return [], [], []
    packet = read_json(candidate.path)
    repair: list[dict[str, Any]] = []
    proof: list[dict[str, Any]] = []
    passes: list[dict[str, Any]] = []
    for item in normalized_notes(packet):
        action = action_for_item(item, candidate.path)
        if not action:
            continue
        decision = normalize_decision(action.get("decision"))
        if decision in REPAIR_DECISIONS:
            repair.append(action)
        elif decision in PROOF_DECISIONS:
            proof.append(action)
        elif decision in PASS_DECISIONS:
            passes.append(action)
    return repair, proof, passes


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Audio Final Listen Fast-Pass Notes Inbox",
        "",
        f"- Generated: `{report['generatedAt']}`",
        f"- Baseline: `{report['baselineId']}`",
        f"- Matching candidates: `{report['matchingCandidateCount']}`",
        f"- Selected candidate: `{report['selectedCandidate']['path'] if report.get('selectedCandidate') else 'none'}`",
        f"- Repair actions: `{report['repairActionCount']}`",
        f"- Focused proof actions: `{report['focusedProofActionCount']}`",
        f"- Pass/context actions: `{report['passContextCount']}`",
        "",
        "This inbox does not approve audio. It validates exported fast-pass notes and routes findings into the unified post-review action queue.",
        "",
    ]
    if report.get("ignoredFiles"):
        lines.extend(["## Ignored files", ""])
        for ignored in report["ignoredFiles"][:10]:
            lines.append(f"- `{ignored['path']}`: {ignored['reason']}")
        lines.append("")
    if report.get("repairActions"):
        lines.extend(["## Repair actions", ""])
        for action in report["repairActions"]:
            lines.append(f"- `{action.get('timecode')}` {action.get('label')}: {action.get('reviewerNotes') or 'no note'}")
        lines.append("")
    if report.get("focusedProofActions"):
        lines.extend(["## Focused proof actions", ""])
        for action in report["focusedProofActions"]:
            lines.append(f"- `{action.get('timecode')}` {action.get('label')}: {action.get('reviewerNotes') or 'no note'}")
        lines.append("")
    return "\n".join(lines)


def update_manifest(manifest_path: Path, report: dict[str, Any]) -> None:
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioFinalListenFastPassNotesInbox"] = report["json"]
    outputs["latestAudioFinalListenFastPassNotesInboxMarkdown"] = report["markdown"]
    outputs.setdefault("audioFinalListenFastPassNotesInboxes", []).append(report["json"])
    outputs.setdefault("audioFinalListenFastPassNotesInboxMarkdowns", []).append(report["markdown"])
    manifest["latestAudioFinalListenFastPassNotesInboxGeneratedAt"] = report["generatedAt"]
    write_json(manifest_path, manifest)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline-dir", required=True)
    parser.add_argument("--search-dir", action="append", default=[])
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(Path(args.baseline_dir))
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    baseline_id = str(manifest.get("baselineId") or baseline_dir.name)
    slug = safe_slug(baseline_id)
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    generated_iso = datetime.now(timezone.utc).isoformat()
    search_dirs = [Path(item) for item in args.search_dir] if args.search_dir else default_search_dirs(baseline_dir)

    candidates: list[Candidate] = []
    ignored: list[dict[str, Any]] = []
    for path in iter_json_files(search_dirs):
        candidate, reason = classify_file(path, baseline_id)
        if candidate:
            candidates.append(candidate)
        elif reason:
            ignored.append(reason)

    selected = candidates[0] if candidates else None
    repair_actions, focused_proof_actions, pass_context_actions = build_actions(selected)

    output_json = baseline_dir / f"final-listen-fast-pass-notes-inbox-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"final-listen-fast-pass-notes-inbox-{slug}-{generated_at}.md"
    report = {
        "schema": "quipsly.audio.final-listen-fast-pass-notes-inbox.v1",
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "generatedAt": generated_iso,
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
        "searchDirs": [str(path) for path in search_dirs],
        "matchingCandidateCount": len(candidates),
        "validNotesPacketCount": len(candidates),
        "selectedCandidate": candidate_dict(selected) if selected else None,
        "ignoredFiles": ignored,
        "repairActions": repair_actions,
        "focusedProofActions": focused_proof_actions,
        "passContextActions": pass_context_actions,
        "repairActionCount": len(repair_actions),
        "focusedProofActionCount": len(focused_proof_actions),
        "passContextCount": len(pass_context_actions),
        "json": str(output_json),
        "markdown": str(output_md),
    }
    write_json(output_json, report)
    output_md.write_text(render_markdown(report) + "\n", encoding="utf-8")
    update_manifest(manifest_path, report)
    print(json.dumps({"json": str(output_json), "markdown": str(output_md), "matchingCandidateCount": len(candidates)}, indent=2))


if __name__ == "__main__":
    main()
