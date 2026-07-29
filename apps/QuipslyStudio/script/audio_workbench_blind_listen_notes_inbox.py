#!/usr/bin/env python3
"""Find exported blind-listen notes for an audio baseline.

Blind-listen notes are human evidence, not final approval. This inbox maps
BLIND-* decisions back to the sampler's hidden Defect Atlas reveal entries and
creates scoped pass/proof/repair routing counts. It does not approve audio,
fail audio, unlock branch inheritance, render branches, upload, publish, or
mutate source/original media.
"""

from __future__ import annotations

import argparse
import html
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA = "quipsly.audio-workbench.blind-listen-notes.v1"
PASS_DECISIONS = {"pass", "passed", "ok", "acceptable", "sounds-good"}
REPAIR_DECISIONS = {"fail", "failed", "needs-repair", "repair", "needs-scoped-v007-repair", "scoped-v007-repair"}
PROOF_DECISIONS = {"unsure", "needs-proof", "more-proof", "needs-more-proof", "needs-focused-proof", "proof"}
PENDING_DECISIONS = {"", "pending", "not-reviewed", "todo"}


@dataclass(frozen=True)
class Candidate:
    path: Path
    row_count: int
    matched_count: int
    pass_count: int
    repair_count: int
    proof_count: int
    pending_count: int
    unknown_blind_id_count: int
    empty_note_count: int
    low_rating_count: int
    suggested_status: str
    blind_listen_decision: str
    exported_at: str
    mtime: float


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    expanded = input_path.expanduser()
    if (expanded / "manifest.json").exists():
        return expanded.resolve()
    nested = expanded / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.resolve()
    raise FileNotFoundError(f"Could not find baseline manifest under {input_path}")


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in ("path", "jsonPath", "versionedPath"):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def load_output_report(outputs: dict[str, Any], key: str) -> tuple[dict[str, Any], str | None]:
    path = output_path(outputs.get(key))
    if not path:
        return {}, None
    report_path = Path(path)
    if not report_path.exists() or report_path.suffix.lower() != ".json":
        return {}, path
    try:
        return read_json(report_path), path
    except json.JSONDecodeError:
        return {}, path


def default_search_dirs(baseline_dir: Path) -> list[Path]:
    home = Path.home()
    return [home / "Downloads", home / "Desktop", baseline_dir]


def iter_json_files(search_dirs: list[Path]) -> list[Path]:
    patterns = [
        "*blind-listen*notes*.json",
        "*blind_listen*notes*.json",
        "*quipsly-blind-listen-notes*.json",
        "*AUDIO_BLIND_LISTEN*NOTES*.json",
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
                name = path.name.lower()
                if "template" in name or "inbox" in name or "smoke" in name:
                    continue
                if path.is_file() and resolved not in seen:
                    files.append(resolved)
                    seen.add(resolved)
    return sorted(files, key=lambda item: item.stat().st_mtime if item.exists() else 0, reverse=True)


def normalize_decision(value: Any) -> str:
    return str(value or "pending").strip().lower()


def normalized_rows(packet: dict[str, Any]) -> list[dict[str, Any]]:
    rows = packet.get("notes") or packet.get("items") or packet.get("rows") or []
    return [dict(row) for row in rows if isinstance(row, dict)]


def sampler_index(report: dict[str, Any]) -> dict[str, dict[str, Any]]:
    samples = report.get("samples") or []
    return {str(row.get("blindId")): dict(row) for row in samples if isinstance(row, dict) and row.get("blindId")}


def int_score(value: Any) -> int | None:
    try:
        text = str(value).strip()
        if not text:
            return None
        return int(float(text))
    except (TypeError, ValueError):
        return None


def low_rating(row: dict[str, Any]) -> bool:
    for key in ("clarityScore", "bleedNoiseScore", "naturalnessScore", "fatigueScore"):
        score = int_score(row.get(key))
        if score is not None and score <= 2:
            return True
    return False


def count_rows(packet: dict[str, Any], index: dict[str, dict[str, Any]]) -> tuple[int, int, int, int, int, int, int, int, int]:
    row_count = matched_count = pass_count = repair_count = proof_count = pending_count = unknown_blind_id_count = empty_note_count = low_rating_count = 0
    for row in normalized_rows(packet):
        row_count += 1
        blind_id = str(row.get("blindId") or "")
        if blind_id not in index:
            unknown_blind_id_count += 1
            continue
        matched_count += 1
        decision = normalize_decision(row.get("decision"))
        if decision in REPAIR_DECISIONS:
            repair_count += 1
        elif decision in PROOF_DECISIONS or low_rating(row):
            proof_count += 1
        elif decision in PASS_DECISIONS:
            pass_count += 1
        elif decision in PENDING_DECISIONS:
            pending_count += 1
        else:
            proof_count += 1
        if not str(row.get("notes") or "").strip():
            empty_note_count += 1
        if low_rating(row):
            low_rating_count += 1
    return row_count, matched_count, pass_count, repair_count, proof_count, pending_count, unknown_blind_id_count, empty_note_count, low_rating_count


def suggested_status(packet: dict[str, Any], index: dict[str, dict[str, Any]]) -> tuple[str, str]:
    row_count, matched_count, pass_count, repair_count, proof_count, pending_count, unknown_blind_id_count, empty_note_count, low_rating_count = count_rows(packet, index)
    if row_count and not matched_count:
        return "blind-listen-notes-incomplete", "blind-listen-notes-no-matching-ids"
    if unknown_blind_id_count:
        return "blind-listen-notes-incomplete", "blind-listen-notes-unknown-blind-ids"
    if repair_count:
        return "blind-listen-notes-found", "blind-listen-needs-scoped-v007-repair"
    if proof_count or low_rating_count:
        return "blind-listen-notes-found", "blind-listen-needs-focused-proof"
    if matched_count and pending_count == 0 and unknown_blind_id_count == 0 and pass_count == matched_count:
        return "blind-listen-notes-found", "blind-listen-pass-context"
    return "blind-listen-notes-incomplete", "blind-listen-notes-incomplete"


def classify_file(path: Path, baseline_id: str, index: dict[str, dict[str, Any]]) -> tuple[Candidate | None, dict[str, Any] | None, dict[str, Any] | None]:
    try:
        packet = read_json(path)
    except Exception as exc:  # noqa: BLE001
        return None, None, {"path": str(path), "reason": f"not readable JSON: {exc}"}
    if packet.get("schema") != SCHEMA:
        return None, None, {"path": str(path), "reason": f"unsupported schema: {packet.get('schema')}"}
    if packet.get("baselineId") != baseline_id:
        return None, None, {"path": str(path), "reason": f"wrong baselineId: {packet.get('baselineId')} != {baseline_id}"}
    exported_at = str(packet.get("generatedAt") or packet.get("exportedAt") or packet.get("createdAt") or "").strip()
    if not exported_at:
        return None, None, {"path": str(path), "reason": "notes packet has no generatedAt/exportedAt/createdAt"}
    row_count, matched_count, pass_count, repair_count, proof_count, pending_count, unknown_blind_id_count, empty_note_count, low_rating_count = count_rows(packet, index)
    status, decision = suggested_status(packet, index)
    return Candidate(
        path=path,
        row_count=row_count,
        matched_count=matched_count,
        pass_count=pass_count,
        repair_count=repair_count,
        proof_count=proof_count,
        pending_count=pending_count,
        unknown_blind_id_count=unknown_blind_id_count,
        empty_note_count=empty_note_count,
        low_rating_count=low_rating_count,
        suggested_status=status,
        blind_listen_decision=decision,
        exported_at=exported_at,
        mtime=path.stat().st_mtime,
    ), packet, None


def candidate_dict(candidate: Candidate) -> dict[str, Any]:
    return {
        "path": str(candidate.path),
        "sourceSchema": SCHEMA,
        "rowCount": candidate.row_count,
        "matchedBlindIdCount": candidate.matched_count,
        "passCount": candidate.pass_count,
        "repairCount": candidate.repair_count,
        "focusedProofCount": candidate.proof_count,
        "pendingCount": candidate.pending_count,
        "unknownBlindIdCount": candidate.unknown_blind_id_count,
        "emptyNoteCount": candidate.empty_note_count,
        "lowRatingCount": candidate.low_rating_count,
        "blindListenDecision": candidate.blind_listen_decision,
        "suggestedDecisionStatus": candidate.suggested_status,
        "exportedAt": candidate.exported_at,
        "mtime": candidate.mtime,
    }


def selected_route(candidate: Candidate | None) -> dict[str, Any]:
    if not candidate:
        return {
            "nextAction": "No matching blind-listen notes were found. Open AUDIO_BLIND_LISTEN_SAMPLER.html, export notes JSON, then rerun this inbox.",
            "approvalDecisionAllowed": False,
            "reason": "No blind-listen notes packet found for this baseline.",
        }
    if candidate.blind_listen_decision == "blind-listen-needs-scoped-v007-repair":
        next_action = "Keep v006 locked and route the revealed atlas item(s) into scoped v007 repair planning."
    elif candidate.blind_listen_decision == "blind-listen-needs-focused-proof":
        next_action = "Keep v006 locked and generate focused proof/listen material for the revealed atlas item(s)."
    elif candidate.blind_listen_decision == "blind-listen-pass-context":
        next_action = "Treat blind notes as pass context only; full-spine approval still requires the guarded human-listen decision front door."
    else:
        next_action = "Blind notes are incomplete or do not map to current sampler IDs; keep v006 locked and request completed notes."
    return {
        "suggestedDecisionStatus": candidate.suggested_status,
        "blindListenDecision": candidate.blind_listen_decision,
        "nextAction": next_action,
        "approvalDecisionAllowed": False,
        "reason": "Blind-listen notes are scoped evidence, not a full-spine approval token.",
    }


def actions_from_packet(packet: dict[str, Any] | None, index: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    if not packet:
        return []
    actions: list[dict[str, Any]] = []
    for row in normalized_rows(packet):
        blind_id = str(row.get("blindId") or "")
        sample = index.get(blind_id)
        if not sample:
            continue
        reveal = sample.get("hiddenReveal") if isinstance(sample.get("hiddenReveal"), dict) else {}
        decision = normalize_decision(row.get("decision"))
        if decision in REPAIR_DECISIONS:
            action_type = "scoped-v007-repair"
        elif decision in PROOF_DECISIONS or low_rating(row):
            action_type = "focused-proof"
        elif decision in PASS_DECISIONS:
            action_type = "pass-context"
        else:
            action_type = "pending-review"
        actions.append(
            {
                "blindId": blind_id,
                "actionType": action_type,
                "decision": decision,
                "notes": row.get("notes") or "",
                "scores": {
                    "clarity": row.get("clarityScore"),
                    "bleedNoise": row.get("bleedNoiseScore"),
                    "naturalness": row.get("naturalnessScore"),
                    "fatigue": row.get("fatigueScore"),
                },
                "defectAtlasItemId": reveal.get("defectAtlasItemId"),
                "stage": reveal.get("stage"),
                "severity": reveal.get("severity"),
                "title": reveal.get("title"),
                "startSeconds": sample.get("startSeconds"),
                "endSeconds": sample.get("endSeconds"),
                "nextAction": reveal.get("nextAction"),
            }
        )
    return actions


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Blind Listen Notes Inbox: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"- Status: `{report['status']}`",
        f"- Matching candidates: `{report['matchingCandidateCount']}`",
        f"- Selected candidate: `{report.get('selectedCandidatePath') or 'none'}`",
        f"- Pass/proof/repair/pending: `{report['passContextCount']}` / `{report['focusedProofActionCount']}` / `{report['repairActionCount']}` / `{report['pendingActionCount']}`",
        f"- Unknown blind IDs: `{report['unknownBlindIdCount']}`",
        f"- Low ratings: `{report['lowRatingCount']}`",
        "",
        "## Route",
        "",
        f"- Decision: `{report['route'].get('blindListenDecision', 'none')}`",
        f"- Next action: {report['route']['nextAction']}",
        f"- Approval decision allowed here: `{str(report['route']['approvalDecisionAllowed']).lower()}`",
        "",
        "## Actions",
        "",
        "| Blind ID | Action | Stage | Severity | Atlas item | Notes |",
        "|---|---|---|---:|---|---|",
    ]
    for action in report["actions"]:
        notes = str(action.get("notes") or "").replace("|", "\\|")
        lines.append(f"| `{action['blindId']}` | `{action['actionType']}` | `{action.get('stage')}` | `{action.get('severity')}` | `{action.get('defectAtlasItemId')}` | {notes} |")
    lines.extend(["", "## Guardrail", "", "This inbox can create scoped evidence and repair/proof/pass-context routes. It cannot approve the spine, unlock branches, render, upload, publish, or mutate originals.", ""])
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    rows = []
    for action in report["actions"]:
        rows.append(f"<tr><td>{html.escape(str(action.get('blindId')))}</td><td>{html.escape(str(action.get('actionType')))}</td><td>{html.escape(str(action.get('stage')))}</td><td>{html.escape(str(action.get('severity')))}</td><td>{html.escape(str(action.get('defectAtlasItemId')))}</td><td>{html.escape(str(action.get('notes') or ''))}</td></tr>")
    return f"""<!doctype html><html><head><meta charset=\"utf-8\"><title>Blind Listen Notes Inbox</title>
<style>
:root {{ color-scheme: dark; --bg:#111711; --panel:#1c261c; --ink:#f4ecd9; --muted:#bdae92; --gold:#f2c94c; --blue:#76c7ff; }}
body {{ margin:0; font:15px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif; background:radial-gradient(circle at top left,#294633,var(--bg)); color:var(--ink); }}
main {{ max-width:1120px; margin:0 auto; padding:34px; }}
.hero,table {{ background:rgba(28,38,28,.9); border:1px solid rgba(242,201,76,.2); border-radius:22px; box-shadow:0 18px 54px rgba(0,0,0,.28); }}
.hero {{ padding:28px; margin-bottom:22px; }}
.pill {{ display:inline-block; margin:0 8px 8px 0; padding:7px 11px; border-radius:999px; background:rgba(255,255,255,.08); color:var(--muted); }}
table {{ width:100%; border-collapse:collapse; overflow:hidden; }}
td,th {{ padding:10px; border-bottom:1px solid rgba(255,255,255,.1); text-align:left; }}
</style></head><body><main>
<section class=\"hero\"><span class=\"pill\">{html.escape(report['status'])}</span><span class=\"pill\">candidates {report['matchingCandidateCount']}</span><span class=\"pill\">repair {report['repairActionCount']}</span><span class=\"pill\">proof {report['focusedProofActionCount']}</span><span class=\"pill\">pass context {report['passContextCount']}</span>
<h1>Blind Listen Notes Inbox</h1><p>{html.escape(report['route']['nextAction'])}</p><p><b>Selected:</b> {html.escape(str(report.get('selectedCandidatePath') or 'none'))}</p><p><b>Guardrail:</b> this is evidence routing only; guarded full-spine approval still happens elsewhere.</p></section>
<table><thead><tr><th>Blind ID</th><th>Action</th><th>Stage</th><th>Severity</th><th>Atlas item</th><th>Notes</th></tr></thead><tbody>{''.join(rows)}</tbody></table>
</main></body></html>"""


def write_open_command(path: Path, target: Path) -> None:
    write_text(path, "#!/bin/zsh\nset -e\nopen " + shell_quote(str(target)) + "\n")
    os.chmod(path, 0o755)


def build_report(baseline_dir: Path, search_dirs: list[Path]) -> dict[str, Any]:
    manifest = read_json(baseline_dir / "manifest.json")
    outputs = manifest.get("outputs") if isinstance(manifest.get("outputs"), dict) else {}
    baseline_id = str(manifest.get("baselineId") or baseline_dir.name)
    sampler, sampler_path = load_output_report(outputs, "latestAudioBlindListenSampler")
    index = sampler_index(sampler)
    rejected: list[dict[str, Any]] = []
    candidates: list[Candidate] = []
    packets: dict[str, dict[str, Any]] = {}
    for path in iter_json_files(search_dirs):
        candidate, packet, rejection = classify_file(path, baseline_id, index)
        if rejection:
            rejected.append(rejection)
        elif candidate and packet:
            candidates.append(candidate)
            packets[str(candidate.path)] = packet
    candidates.sort(key=lambda item: (item.repair_count, item.proof_count, item.pass_count, item.matched_count, item.mtime), reverse=True)
    selected = candidates[0] if candidates else None
    selected_packet = packets.get(str(selected.path)) if selected else None
    actions = actions_from_packet(selected_packet, index)
    repair_count = sum(1 for action in actions if action["actionType"] == "scoped-v007-repair")
    proof_count = sum(1 for action in actions if action["actionType"] == "focused-proof")
    pass_count = sum(1 for action in actions if action["actionType"] == "pass-context")
    pending_count = sum(1 for action in actions if action["actionType"] == "pending-review")
    route = selected_route(selected)
    status = selected.suggested_status if selected else "waiting-for-blind-listen-notes"
    return {
        "schema": "quipsly.audio-workbench.blind-listen-notes-inbox.v1",
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "status": status,
        "samplerPath": sampler_path,
        "samplerSampleCount": len(index),
        "searchDirs": [str(path) for path in search_dirs],
        "matchingCandidateCount": len(candidates),
        "rejectedCandidateCount": len(rejected),
        "selectedCandidatePath": str(selected.path) if selected else None,
        "candidates": [candidate_dict(candidate) for candidate in candidates[:12]],
        "rejectedCandidates": rejected[:20],
        "actions": actions,
        "repairActionCount": repair_count,
        "focusedProofActionCount": proof_count,
        "passContextCount": pass_count,
        "pendingActionCount": pending_count,
        "unknownBlindIdCount": selected.unknown_blind_id_count if selected else 0,
        "lowRatingCount": selected.low_rating_count if selected else 0,
        "emptyNoteCount": selected.empty_note_count if selected else 0,
        "route": route,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }


def update_manifest(baseline_dir: Path, report: dict[str, Any], stable_json: Path, stable_md: Path, stable_html: Path, stable_open: Path) -> None:
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioBlindListenNotesInbox"] = str(stable_json)
    outputs["latestAudioBlindListenNotesInboxMarkdown"] = str(stable_md)
    outputs["latestAudioBlindListenNotesInboxHtml"] = str(stable_html)
    outputs["latestAudioBlindListenNotesInboxOpenCommand"] = str(stable_open)
    outputs.setdefault("audioBlindListenNotesInboxHistory", []).append(str(stable_json))
    outputs["audioBlindListenNotesInboxHistory"] = outputs["audioBlindListenNotesInboxHistory"][-20:]
    manifest["audioBlindListenNotesInboxLatestStatus"] = report["status"]
    manifest["audioBlindListenNotesInboxMatchingCandidateCount"] = report["matchingCandidateCount"]
    manifest["audioBlindListenNotesInboxRepairActionCount"] = report["repairActionCount"]
    manifest["audioBlindListenNotesInboxFocusedProofActionCount"] = report["focusedProofActionCount"]
    manifest["audioBlindListenNotesInboxPassContextCount"] = report["passContextCount"]
    manifest["audioBlindListenNotesInboxPendingActionCount"] = report["pendingActionCount"]
    manifest["audioBlindListenNotesInboxUnknownBlindIdCount"] = report["unknownBlindIdCount"]
    manifest["audioBlindListenNotesInboxLowRatingCount"] = report["lowRatingCount"]
    manifest["audioBlindListenNotesInboxApprovalStateChanged"] = False
    manifest["audioBlindListenNotesInboxBranchStateChanged"] = False
    manifest["audioBlindListenNotesInboxRenderAttempted"] = False
    manifest["audioBlindListenNotesInboxUploadAttempted"] = False
    manifest["audioBlindListenNotesInboxPublicationAttempted"] = False
    manifest["audioBlindListenNotesInboxOriginalMediaMutated"] = False
    write_json(manifest_path, manifest)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--search-dir", action="append", type=Path, default=[])
    args = parser.parse_args()
    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    search_dirs = [path.expanduser().resolve() for path in args.search_dir] or default_search_dirs(baseline_dir)
    report = build_report(baseline_dir, search_dirs)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    slug = safe_slug(report["baselineId"].replace("episode-4-conformed-production-baseline-", ""))
    stable_json = baseline_dir / "AUDIO_BLIND_LISTEN_NOTES_INBOX.json"
    stable_md = baseline_dir / "AUDIO_BLIND_LISTEN_NOTES_INBOX.md"
    stable_html = baseline_dir / "AUDIO_BLIND_LISTEN_NOTES_INBOX.html"
    stable_open = baseline_dir / "OPEN_AUDIO_BLIND_LISTEN_NOTES_INBOX.command"
    versioned_dir = baseline_dir / f"audio-blind-listen-notes-inbox-{slug}-{stamp}"
    versioned_dir.mkdir(parents=True, exist_ok=True)
    versioned_json = versioned_dir / "blind-listen-notes-inbox.json"
    versioned_md = versioned_dir / "blind-listen-notes-inbox.md"
    versioned_html = versioned_dir / "blind-listen-notes-inbox.html"
    versioned_open = versioned_dir / "open-blind-listen-notes-inbox.command"
    markdown = render_markdown(report)
    html_doc = render_html(report)
    for path in (stable_json, versioned_json):
        write_json(path, report)
    for path in (stable_md, versioned_md):
        write_text(path, markdown)
    for path in (stable_html, versioned_html):
        write_text(path, html_doc)
    for path, target in ((stable_open, stable_html), (versioned_open, versioned_html)):
        write_open_command(path, target)
    update_manifest(baseline_dir, report, stable_json, stable_md, stable_html, stable_open)
    print(json.dumps({"status": report["status"], "matchingCandidateCount": report["matchingCandidateCount"], "repairActionCount": report["repairActionCount"], "focusedProofActionCount": report["focusedProofActionCount"], "passContextCount": report["passContextCount"], "json": str(stable_json)}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
