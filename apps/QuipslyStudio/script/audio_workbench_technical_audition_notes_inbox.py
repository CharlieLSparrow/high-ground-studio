#!/usr/bin/env python3
"""Find exported technical audition snippet notes for an audio baseline.

The technical audition snippet pack gives reviewers short playable clips around
full-spine engineering concerns. This inbox consumes exported notes for those
clips and routes pass, focused-proof, and repair context into the unified
post-review action queue.

It does not approve audio, fail audio, render media, upload files, unlock
branches, or mutate original media.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA = "quipsly.audio-workbench.technical-audition-snippet-notes.v1"
REPAIR_DECISIONS = {"needs-repair", "repair", "fail", "failed", "bad", "unnatural", "distracting"}
PROOF_DECISIONS = {"needs-proof", "more-proof", "needs-focused-proof", "unsure", "check-again"}
PASS_DECISIONS = {"pass", "ok", "acceptable", "sounds-good", "natural", "approved-context"}


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


def output_path(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in ("path", "jsonPath", "markdownPath", "htmlPath"):
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
        "*technical*audition*notes*.json",
        "*technical*audition*snippet*notes*.json",
        "*audio*technical*notes*.json",
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
            for path in directory.glob("*/technical*audition*notes*.json"):
                resolved = path.resolve()
                if path.is_file() and resolved not in seen:
                    files.append(resolved)
                    seen.add(resolved)
    return sorted(files, key=lambda item: item.stat().st_mtime if item.exists() else 0, reverse=True)


def normalize_decision(value: Any) -> str:
    return str(value or "unreviewed").strip().lower() or "unreviewed"


def normalized_notes(packet: dict[str, Any]) -> list[dict[str, Any]]:
    rows = packet.get("items") or packet.get("notes") or packet.get("moments") or []
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
    value = max(0.0, value)
    hours = int(value // 3600)
    minutes = int((value % 3600) // 60)
    secs = value % 60
    return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"


def load_snippet_pack(manifest: dict[str, Any], notes_packet: dict[str, Any] | None) -> dict[str, Any]:
    source_pack = output_path(notes_packet.get("createdFrom") if notes_packet else None)
    outputs = manifest.get("outputs") or {}
    source_pack = source_pack or output_path(outputs.get("latestAudioTechnicalAuditionSnippetPack"))
    if not source_pack:
        return {}
    path = Path(source_pack).expanduser()
    if not path.exists():
        return {}
    try:
        return read_json(path)
    except json.JSONDecodeError:
        return {}


def item_map(pack: dict[str, Any]) -> dict[str, dict[str, Any]]:
    rows = pack.get("items") or []
    return {str(item.get("id")): dict(item) for item in rows if isinstance(item, dict) and item.get("id")}


def action_for_item(item: dict[str, Any], source_packet: Path, items_by_id: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
    decision = normalize_decision(item.get("decision"))
    if decision not in REPAIR_DECISIONS and decision not in PROOF_DECISIONS and decision not in PASS_DECISIONS:
        return None
    item_id = str(item.get("id") or item.get("itemId") or "")
    source_item = items_by_id.get(item_id, {})
    title = str(source_item.get("title") or item.get("title") or item_id or "Technical audition clip")
    start_seconds = source_item.get("sectionStartSeconds") or source_item.get("startSeconds")
    end_seconds = source_item.get("sectionEndSeconds")
    timecode = f"{seconds_to_timecode(start_seconds)}-{seconds_to_timecode(end_seconds)}" if end_seconds is not None else seconds_to_timecode(start_seconds)
    note = str(item.get("notes") or item.get("note") or "").strip()
    safe_path = [
        "Keep v006 locked while technical-audition notes are routed.",
        "If a problem is real, create a scoped v007 repair at the owning stage identified by the transformation lineage ledger.",
        "Do not overwrite v006 or change source timing.",
        "Do not unlock branch inheritance from technical-audition notes alone.",
    ]
    base = {
        "sourceNotesPacket": str(source_packet),
        "decision": decision,
        "label": title,
        "timecode": timecode,
        "sequenceStartSeconds": start_seconds,
        "durationSeconds": source_item.get("durationSeconds"),
        "windowStartSeconds": source_item.get("startSeconds"),
        "windowEndSeconds": (source_item.get("startSeconds") or 0) + (source_item.get("durationSeconds") or 0)
        if isinstance(source_item.get("startSeconds"), (int, float)) and isinstance(source_item.get("durationSeconds"), (int, float))
        else None,
        "itemId": item_id,
        "snippetPath": source_item.get("snippetPath"),
        "reviewerNotes": note,
        "listenQuestions": source_item.get("listenQuestions") or [],
        "technicalAuditionReasons": source_item.get("reasons") or [],
        "technicalAuditionRiskScore": source_item.get("riskScore"),
        "safeTreatmentPath": safe_path,
        "doNotDo": [
            "Do not approve the full v006 spine from technical-audition notes alone.",
            "Do not overwrite v006.",
            "Do not mutate original media.",
            "Do not render publication branches from this inbox alone.",
        ],
    }
    if decision in REPAIR_DECISIONS:
        return {
            **base,
            "actionType": "v007-technical-audition-repair-required",
            "firstMove": "Route this exact section to the owning audio stage and create a scoped v007 repair/proof candidate.",
        }
    if decision in PROOF_DECISIONS:
        return {
            **base,
            "actionType": "technical-audition-focused-proof-needed",
            "firstMove": "Render or inspect a tighter source-vs-master proof around this section before pass/fail.",
        }
    return {
        **base,
        "actionType": "technical-audition-pass-context",
        "firstMove": "Preserve as pass context for this technical slice only; full approval still needs explicit human listen decision.",
    }


def build_actions(candidate: Candidate | None, manifest: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    if candidate is None:
        return [], [], [], {}
    packet = read_json(candidate.path)
    pack = load_snippet_pack(manifest, packet)
    items_by_id = item_map(pack)
    repair: list[dict[str, Any]] = []
    proof: list[dict[str, Any]] = []
    passes: list[dict[str, Any]] = []
    for item in normalized_notes(packet):
        action = action_for_item(item, candidate.path, items_by_id)
        if not action:
            continue
        decision = normalize_decision(action.get("decision"))
        if decision in REPAIR_DECISIONS:
            repair.append(action)
        elif decision in PROOF_DECISIONS:
            proof.append(action)
        elif decision in PASS_DECISIONS:
            passes.append(action)
    return repair, proof, passes, pack


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Audio Technical Audition Notes Inbox",
        "",
        f"- Generated: `{report['generatedAt']}`",
        f"- Baseline: `{report['baselineId']}`",
        f"- Matching candidates: `{report['matchingCandidateCount']}`",
        f"- Selected candidate: `{report['selectedCandidate']['path'] if report.get('selectedCandidate') else 'none'}`",
        f"- Repair actions: `{report['repairActionCount']}`",
        f"- Focused proof actions: `{report['focusedProofActionCount']}`",
        f"- Pass/context actions: `{report['passContextCount']}`",
        "",
        "This inbox does not approve audio. It validates exported technical audition snippet notes and routes findings into the unified post-review action queue.",
        "",
    ]
    if report.get("ignoredFiles"):
        lines.extend(["## Ignored files", ""])
        for ignored in report["ignoredFiles"][:10]:
            lines.append(f"- `{ignored['path']}`: {ignored['reason']}")
        lines.append("")
    for title, key in [
        ("Repair actions", "repairActions"),
        ("Focused proof actions", "focusedProofActions"),
        ("Pass context", "passContextActions"),
    ]:
        if report.get(key):
            lines.extend([f"## {title}", ""])
            for action in report[key][:30]:
                lines.append(f"- `{action.get('timecode')}` {action.get('label')}: {action.get('reviewerNotes') or 'no note'}")
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


def update_manifest(manifest_path: Path, report: dict[str, Any]) -> None:
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioTechnicalAuditionNotesInbox"] = report["json"]
    outputs["latestAudioTechnicalAuditionNotesInboxMarkdown"] = report["markdown"]
    outputs.setdefault("audioTechnicalAuditionNotesInboxes", []).append(report["json"])
    outputs.setdefault("audioTechnicalAuditionNotesInboxMarkdowns", []).append(report["markdown"])
    manifest["latestAudioTechnicalAuditionNotesInboxGeneratedAt"] = report["generatedAt"]
    write_json(manifest_path, manifest)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
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
    repair_actions, focused_proof_actions, pass_context_actions, pack = build_actions(selected, manifest)

    output_json = baseline_dir / f"technical-audition-notes-inbox-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"technical-audition-notes-inbox-{slug}-{generated_at}.md"
    report = {
        "schema": "quipsly.audio-workbench.technical-audition-notes-inbox.v1",
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
        "sourcePack": pack.get("jsonPath") or output_path((manifest.get("outputs") or {}).get("latestAudioTechnicalAuditionSnippetPack")),
        "sourcePackItemCount": len(pack.get("items") or []),
        "repairActions": repair_actions,
        "focusedProofActions": focused_proof_actions,
        "passContextActions": pass_context_actions,
        "repairActionCount": len(repair_actions),
        "focusedProofActionCount": len(focused_proof_actions),
        "passContextCount": len(pass_context_actions),
        "json": str(output_json),
        "markdown": str(output_md),
        "nextSafestAction": "If repair/proof actions exist, route exact timestamps to scoped v007 proof candidates. If only pass context exists, keep v006 locked until full human listen approval is explicit.",
    }
    write_json(output_json, report)
    output_md.write_text(render_markdown(report) + "\n", encoding="utf-8")
    update_manifest(manifest_path, report)
    print(
        json.dumps(
            {
                "json": str(output_json),
                "markdown": str(output_md),
                "matchingCandidateCount": len(candidates),
                "repairActionCount": len(repair_actions),
                "focusedProofActionCount": len(focused_proof_actions),
                "passContextCount": len(pass_context_actions),
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
