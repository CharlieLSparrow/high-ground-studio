#!/usr/bin/env python3
"""Find exported Audio Defect Atlas notes for an audio baseline.

The Audio Defect Atlas is a stage-aware risk map. This inbox turns human notes
against atlas items into scoped repair/proof/pass-context actions. It is not an
approval path. It does not approve audio, fail audio, unlock branch inheritance,
render branches, upload, publish, or mutate original/source media.
"""

from __future__ import annotations

import argparse
import html
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA = "quipsly.audio-workbench.defect-atlas-notes.v1"
REPAIR_DECISIONS = {"fail", "failed", "needs-repair", "repair", "needs-scoped-v007-repair", "scoped-v007-repair"}
PROOF_DECISIONS = {"unsure", "needs-proof", "more-proof", "needs-more-proof", "needs-focused-proof", "proof"}
PASS_DECISIONS = {"pass", "passed", "ok", "acceptable", "sounds-good"}
IGNORE_DECISIONS = {"ignore", "ignore-machine-flag", "not-a-problem", "false-positive"}


@dataclass(frozen=True)
class Candidate:
    path: Path
    row_count: int
    matched_count: int
    pass_count: int
    repair_count: int
    proof_count: int
    ignore_count: int
    pending_count: int
    unknown_item_count: int
    overall_decision: str
    atlas_decision: str
    suggested_status: str
    exported_at: str
    mtime: float


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


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
        for key in ("path", "jsonPath", "markdownPath", "htmlPath", "openCommand", "versionedPath", "versionedJsonPath"):
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
        "*defect-atlas*notes*.json",
        "*defect_atlas*notes*.json",
        "*AUDIO_DEFECT_ATLAS*NOTES*.json",
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
    return str(value or "pending").strip().lower() or "pending"


def normalized_rows(packet: dict[str, Any]) -> list[dict[str, Any]]:
    rows = packet.get("items") or packet.get("rows") or packet.get("notes") or []
    return [dict(item) for item in rows if isinstance(item, dict)]


def atlas_items(report: dict[str, Any]) -> list[dict[str, Any]]:
    rows = report.get("items") or []
    return [dict(row) for row in rows if isinstance(row, dict) and row.get("id")]


def atlas_index(report: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {str(row["id"]): row for row in atlas_items(report)}


def count_decisions(packet: dict[str, Any], index: dict[str, dict[str, Any]]) -> tuple[int, int, int, int, int, int, int, int]:
    row_count = matched_count = pass_count = repair_count = proof_count = ignore_count = pending_count = unknown_item_count = 0
    for row in normalized_rows(packet):
        row_count += 1
        item_id = str(row.get("atlasItemId") or row.get("id") or row.get("itemId") or "")
        if item_id not in index:
            unknown_item_count += 1
            continue
        matched_count += 1
        decision = normalize_decision(row.get("decision"))
        if decision in PASS_DECISIONS:
            pass_count += 1
        elif decision in REPAIR_DECISIONS:
            repair_count += 1
        elif decision in PROOF_DECISIONS:
            proof_count += 1
        elif decision in IGNORE_DECISIONS:
            ignore_count += 1
        else:
            pending_count += 1
    return row_count, matched_count, pass_count, repair_count, proof_count, ignore_count, pending_count, unknown_item_count


def suggested_status(packet: dict[str, Any], index: dict[str, dict[str, Any]]) -> tuple[str, str]:
    row_count, matched_count, pass_count, repair_count, proof_count, ignore_count, pending_count, unknown_item_count = count_decisions(packet, index)
    overall = normalize_decision(packet.get("overallDecision") or packet.get("atlasDecision"))
    if row_count and not matched_count:
        return "atlas-notes-incomplete", "defect-atlas-notes-no-matching-items"
    if overall in REPAIR_DECISIONS or repair_count:
        return "atlas-notes-found", "defect-atlas-needs-scoped-v007-repair"
    if overall in PROOF_DECISIONS or proof_count:
        return "atlas-notes-found", "defect-atlas-needs-focused-proof"
    if matched_count and pending_count == 0 and unknown_item_count == 0 and repair_count == 0 and proof_count == 0 and overall in PASS_DECISIONS:
        if pass_count + ignore_count == matched_count:
            return "atlas-notes-found", "defect-atlas-focused-pass-context"
    return "atlas-notes-incomplete", "defect-atlas-notes-incomplete"


def classify_file(path: Path, baseline_id: str, index: dict[str, dict[str, Any]]) -> tuple[Candidate | None, dict[str, Any] | None, dict[str, Any] | None]:
    try:
        packet = read_json(path)
    except Exception as exc:  # noqa: BLE001 - inbox reports bad files instead of crashing.
        return None, None, {"path": str(path), "reason": f"not readable JSON: {exc}"}
    if packet.get("schema") != SCHEMA:
        return None, None, {"path": str(path), "reason": f"unsupported schema: {packet.get('schema')}"}
    if packet.get("baselineId") != baseline_id:
        return None, None, {"path": str(path), "reason": f"wrong baselineId: {packet.get('baselineId')} != {baseline_id}"}
    exported_at = str(packet.get("exportedAt") or packet.get("createdAt") or "").strip()
    if not exported_at:
        return None, None, {"path": str(path), "reason": "notes packet has no exportedAt or createdAt"}
    row_count, matched_count, pass_count, repair_count, proof_count, ignore_count, pending_count, unknown_item_count = count_decisions(packet, index)
    status, decision = suggested_status(packet, index)
    candidate = Candidate(
        path=path,
        row_count=row_count,
        matched_count=matched_count,
        pass_count=pass_count,
        repair_count=repair_count,
        proof_count=proof_count,
        ignore_count=ignore_count,
        pending_count=pending_count,
        unknown_item_count=unknown_item_count,
        overall_decision=normalize_decision(packet.get("overallDecision") or packet.get("atlasDecision")),
        atlas_decision=decision,
        suggested_status=status,
        exported_at=exported_at,
        mtime=path.stat().st_mtime,
    )
    return candidate, packet, None


def candidate_dict(candidate: Candidate) -> dict[str, Any]:
    return {
        "path": str(candidate.path),
        "sourceSchema": SCHEMA,
        "rowCount": candidate.row_count,
        "matchedItemCount": candidate.matched_count,
        "passCount": candidate.pass_count,
        "repairCount": candidate.repair_count,
        "proofCount": candidate.proof_count,
        "ignoreCount": candidate.ignore_count,
        "pendingCount": candidate.pending_count,
        "unknownItemCount": candidate.unknown_item_count,
        "overallDecision": candidate.overall_decision,
        "atlasDecision": candidate.atlas_decision,
        "suggestedDecisionStatus": candidate.suggested_status,
        "exportedAt": candidate.exported_at,
        "mtime": candidate.mtime,
    }


def selected_route(candidate: Candidate | None) -> dict[str, Any]:
    if not candidate:
        return {
            "nextAction": "No matching Audio Defect Atlas notes were found. Use AUDIO_DEFECT_ATLAS_NOTES_TEMPLATE.json, record pass/proof/repair decisions, then rerun this inbox.",
            "approvalDecisionAllowed": False,
            "reason": "No reviewer notes packet found for this baseline.",
        }
    if candidate.atlas_decision == "defect-atlas-needs-scoped-v007-repair":
        next_action = "Keep v006 locked and route the matching atlas item(s) into scoped v007 repair planning at the owning stage."
    elif candidate.atlas_decision == "defect-atlas-needs-focused-proof":
        next_action = "Keep v006 locked and generate focused proof/listen material for the matching atlas item(s)."
    elif candidate.atlas_decision == "defect-atlas-focused-pass-context":
        next_action = "Treat atlas notes as focused pass context only; full-spine approval still requires the guarded human-listen decision front door."
    else:
        next_action = "Atlas notes are incomplete or do not map to current atlas items; keep v006 locked and request completed notes."
    return {
        "suggestedDecisionStatus": candidate.suggested_status,
        "atlasDecision": candidate.atlas_decision,
        "nextAction": next_action,
        "approvalDecisionAllowed": False,
        "reason": "Defect Atlas notes are scoped evidence, not a full-spine approval token.",
    }


def action_for_row(row: dict[str, Any], item: dict[str, Any], candidate: Candidate) -> dict[str, Any]:
    decision = normalize_decision(row.get("decision"))
    if decision in REPAIR_DECISIONS:
        severity = "repair"
        action_type = "defect-atlas-needs-scoped-v007-repair"
        first_move = "Create or update a scoped v007 repair candidate for this exact atlas item and owning stage."
    elif decision in PROOF_DECISIONS:
        severity = "proof"
        action_type = "defect-atlas-needs-focused-proof"
        first_move = "Generate focused proof/listen evidence for this exact atlas item before changing the master."
    elif decision in PASS_DECISIONS or decision in IGNORE_DECISIONS:
        severity = "pass-context"
        action_type = "defect-atlas-focused-pass-context"
        first_move = "Preserve this as focused pass context; do not treat it as full-spine approval."
    else:
        severity = "context"
        action_type = "defect-atlas-notes-incomplete"
        first_move = "Ask reviewer to choose pass, needs-proof, or needs-repair for this atlas item."
    start = item.get("startSeconds")
    end = item.get("endSeconds")
    duration = None
    try:
        if start is not None and end is not None:
            duration = round(max(0.0, float(end) - float(start)), 3)
    except (TypeError, ValueError):
        duration = None
    return {
        "actionType": action_type,
        "decision": decision,
        "severity": severity,
        "atlasItemId": item.get("id"),
        "stage": item.get("stage"),
        "title": item.get("title"),
        "timecode": item.get("timecode"),
        "sequenceStartSeconds": start,
        "sequenceEndSeconds": end,
        "durationSeconds": duration,
        "sourceKey": item.get("sourceKey"),
        "artifactPath": item.get("artifactPath"),
        "sourceNotesPacket": str(candidate.path),
        "reviewerNotes": row.get("notes") or row.get("symptomHeard") or row.get("repairRequest") or row.get("reviewerNotes") or "",
        "firstMove": first_move,
    }


def review_actions(candidate: Candidate | None, packet: dict[str, Any] | None, index: dict[str, dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if not candidate or not packet:
        return [], []
    actions: list[dict[str, Any]] = []
    unknown: list[dict[str, Any]] = []
    for row in normalized_rows(packet):
        item_id = str(row.get("atlasItemId") or row.get("id") or row.get("itemId") or "")
        item = index.get(item_id)
        if not item:
            unknown.append({"atlasItemId": item_id or None, "decision": normalize_decision(row.get("decision")), "notes": row.get("notes") or row.get("reviewerNotes")})
            continue
        action = action_for_row(row, item, candidate)
        if action["severity"] in {"repair", "proof", "pass-context"}:
            actions.append(action)
    return actions, unknown


def template_rows(items: list[dict[str, Any]], limit: int = 40) -> list[dict[str, Any]]:
    sorted_items = sorted(items, key=lambda row: (-(int(row.get("severityRank") or 0)), row.get("startSeconds") if row.get("startSeconds") is not None else 10**9))[:limit]
    rows: list[dict[str, Any]] = []
    for item in sorted_items:
        rows.append(
            {
                "atlasItemId": item.get("id"),
                "timecode": item.get("timecode"),
                "stage": item.get("stage"),
                "severity": item.get("severity"),
                "title": item.get("title"),
                "decision": "pending",
                "notes": "",
                "safeChoices": ["pass", "needs-proof", "needs-repair", "ignore-machine-flag"],
            }
        )
    return rows


def render_template_markdown(template: dict[str, Any]) -> str:
    lines = [
        "# Audio Defect Atlas Notes Template",
        "",
        f"Baseline: `{template['baselineId']}`",
        "",
        "Use this JSON template to record scoped pass/proof/repair notes against Audio Defect Atlas items. This does not approve the full spine.",
        "",
        "| Time | Stage | Severity | Title | Decision |",
        "|---|---|---:|---|---|",
    ]
    for row in template.get("items") or []:
        lines.append(f"| `{row.get('timecode')}` | `{row.get('stage')}` | `{row.get('severity')}` | {str(row.get('title')).replace('|', '\\|')} | `{row.get('decision')}` |")
    return "\n".join(lines) + "\n"


def render_markdown(report: dict[str, Any]) -> str:
    selected = report.get("selectedCandidate") or {}
    route = report.get("suggestedRoute") or {}
    lines = [
        "# Audio Defect Atlas Notes Inbox",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        "",
        "This inbox receives reviewer notes against the Audio Defect Atlas. It can route scoped repair/proof/pass context, but it cannot approve v006 or unlock branch/render state.",
        "",
        "## Summary",
        "",
        f"- Status: `{report['status']}`",
        f"- Matching candidates: `{report['matchingCandidateCount']}`",
        f"- Ignored files: `{len(report['ignoredFiles'])}`",
        f"- Selected candidate: `{selected.get('path') or 'none'}`",
        f"- Atlas decision: `{selected.get('atlasDecision') or 'none'}`",
        f"- Matched item notes: `{selected.get('matchedItemCount') or 0}`",
        f"- Repair actions: `{report['repairActionCount']}`",
        f"- Focused-proof actions: `{report['focusedProofActionCount']}`",
        f"- Pass-context actions: `{report['passContextCount']}`",
        f"- Unknown item notes: `{report['unknownItemCount']}`",
        f"- Approval decision allowed: `{str(route.get('approvalDecisionAllowed', False)).lower()}`",
        f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
        f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
        f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
        f"- Upload attempted: `{str(report['uploadAttempted']).lower()}`",
        f"- Publication attempted: `{str(report['publicationAttempted']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Next action",
        "",
        route.get("nextAction") or "Record atlas notes, then rerun this inbox.",
        "",
        "## Review actions",
        "",
        "| Type | Time | Stage | Title | First move |",
        "|---|---|---|---|---|",
    ]
    for action in report.get("reviewActions") or []:
        lines.append(
            f"| `{action['actionType']}` | `{action.get('timecode')}` | `{action.get('stage')}` | {str(action.get('title')).replace('|', '\\|')} | {str(action.get('firstMove')).replace('|', '\\|')} |"
        )
    if not report.get("reviewActions"):
        lines.append("| `none` |  |  | No actionable atlas notes found yet. | Use the template and rerun. |")
    lines.extend(["", "## Matching candidates", "", "| File | Decision | Rows | Matched | Repair | Proof | Pass | Pending | Unknown |", "|---|---|---:|---:|---:|---:|---:|---:|---:|"])
    for candidate in report.get("matchingCandidates") or []:
        lines.append(
            f"| `{candidate['path']}` | `{candidate['atlasDecision']}` | `{candidate['rowCount']}` | `{candidate['matchedItemCount']}` | `{candidate['repairCount']}` | `{candidate['proofCount']}` | `{candidate['passCount']}` | `{candidate['pendingCount']}` | `{candidate['unknownItemCount']}` |"
        )
    return "\n".join(lines) + "\n"


def render_html(report: dict[str, Any]) -> str:
    cards = []
    for action in report.get("reviewActions") or []:
        cards.append(
            f"""
            <article class="card {html.escape(str(action.get('severity')))}">
              <div class="meta"><span>{html.escape(str(action.get('timecode')))}</span><span>{html.escape(str(action.get('stage')))}</span><span>{html.escape(str(action.get('actionType')))}</span></div>
              <h2>{html.escape(str(action.get('title')))}</h2>
              <p>{html.escape(str(action.get('firstMove')))}</p>
              <p class="muted">{html.escape(str(action.get('reviewerNotes') or 'No reviewer note text.'))}</p>
            </article>"""
        )
    if not cards:
        cards.append("<article class='card'><h2>No atlas notes yet</h2><p>Use the notes template, choose pass/proof/repair for the relevant atlas items, then rerun the inbox.</p></article>")
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Audio Defect Atlas Notes Inbox</title>
<style>
:root {{ color-scheme: dark; --bg:#101512; --panel:#17221b; --ink:#f3ead8; --muted:#b6aa91; --gold:#f2c84b; --red:#ff6b64; --green:#72d68a; --blue:#73c7ff; }}
body {{ margin:0; font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:radial-gradient(circle at top left,#253a2d,var(--bg)); color:var(--ink); }}
main {{ max-width:1100px; margin:0 auto; padding:34px; }}
.hero,.card {{ background:rgba(23,34,27,.88); border:1px solid rgba(242,200,75,.18); border-radius:22px; box-shadow:0 18px 60px rgba(0,0,0,.28); }}
.hero {{ padding:30px; margin-bottom:18px; }}
h1 {{ margin:0; font-size:34px; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:12px; margin-top:18px; }}
.metric {{ padding:14px 16px; border-radius:16px; background:rgba(255,255,255,.055); }}
.metric b {{ display:block; color:var(--gold); font-size:24px; }}
.cards {{ display:grid; gap:14px; }}
.card {{ padding:20px; }}
.card.repair {{ border-color:rgba(255,107,100,.65); }}
.card.proof {{ border-color:rgba(115,199,255,.45); }}
.card.pass-context {{ border-color:rgba(114,214,138,.45); }}
.meta {{ display:flex; gap:10px; flex-wrap:wrap; color:var(--muted); text-transform:uppercase; letter-spacing:.08em; font-size:12px; }}
.meta span {{ background:rgba(255,255,255,.07); padding:4px 8px; border-radius:999px; }}
.muted {{ color:var(--muted); }}
</style></head><body><main>
<section class="hero"><h1>Audio Defect Atlas Notes Inbox</h1><p>Scoped reviewer notes for {html.escape(report['baselineId'])}. Evidence in, safe next action out. No approval magic.</p>
<div class="grid">
<div class="metric"><b>{report['matchingCandidateCount']}</b>candidate packets</div>
<div class="metric"><b>{report['repairActionCount']}</b>repairs</div>
<div class="metric"><b>{report['focusedProofActionCount']}</b>proofs</div>
<div class="metric"><b>{report['passContextCount']}</b>pass context</div>
<div class="metric"><b>{str(report['approvalStateChanged']).lower()}</b>approval changed</div>
</div></section>
<section class="cards">{''.join(cards)}</section>
</main></body></html>"""


def write_open_command(path: Path, target: Path) -> None:
    path.write_text("#!/bin/zsh\nset -euo pipefail\nopen " + shell_quote(str(target)) + "\n", encoding="utf-8")
    path.chmod(0o755)


def update_manifest(manifest_path: Path, report: dict[str, Any], template: dict[str, str]) -> None:
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioDefectAtlasNotesInbox"] = report["jsonPath"]
    outputs["latestAudioDefectAtlasNotesInboxMarkdown"] = report["markdownPath"]
    outputs["latestAudioDefectAtlasNotesInboxHtml"] = report["htmlPath"]
    outputs["latestAudioDefectAtlasNotesInboxOpenCommand"] = report["openCommand"]
    outputs["latestAudioDefectAtlasNotesTemplate"] = template["jsonPath"]
    outputs["latestAudioDefectAtlasNotesTemplateMarkdown"] = template["markdownPath"]
    outputs.setdefault("audioDefectAtlasNotesInboxes", []).append(report["jsonPath"])
    manifest["audioDefectAtlasNotesInboxCount"] = int(manifest.get("audioDefectAtlasNotesInboxCount") or 0) + 1
    manifest["audioDefectAtlasNotesInboxLatestStatus"] = report["status"]
    manifest["audioDefectAtlasNotesInboxMatchingCandidateCount"] = report["matchingCandidateCount"]
    manifest["audioDefectAtlasNotesInboxRepairActionCount"] = report["repairActionCount"]
    manifest["audioDefectAtlasNotesInboxFocusedProofActionCount"] = report["focusedProofActionCount"]
    manifest["audioDefectAtlasNotesInboxPassContextCount"] = report["passContextCount"]
    manifest["audioDefectAtlasNotesInboxUnknownItemCount"] = report["unknownItemCount"]
    manifest["audioDefectAtlasNotesInboxApprovalStateChanged"] = False
    manifest["audioDefectAtlasNotesInboxBranchStateChanged"] = False
    manifest["audioDefectAtlasNotesInboxRenderAttempted"] = False
    manifest["audioDefectAtlasNotesInboxUploadAttempted"] = False
    manifest["audioDefectAtlasNotesInboxPublicationAttempted"] = False
    manifest["audioDefectAtlasNotesInboxOriginalMediaMutated"] = False
    write_json(manifest_path, manifest)


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
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    generated_iso = datetime.now(timezone.utc).isoformat()

    atlas, atlas_path = load_output_report(outputs, "latestAudioDefectAtlas")
    index = atlas_index(atlas)
    search_dirs = args.search_dir or default_search_dirs(baseline_dir)

    template_payload = {
        "schema": SCHEMA,
        "createdAt": generated_iso,
        "baselineId": baseline_id,
        "sourceAtlasPath": atlas_path,
        "overallDecision": "pending",
        "reviewer": "",
        "items": template_rows(atlas_items(atlas)),
        "safety": {
            "thisDoesNotApproveAudio": True,
            "thisDoesNotUnlockBranches": True,
            "thisDoesNotRenderOrPublish": True,
        },
    }
    template_json = baseline_dir / "AUDIO_DEFECT_ATLAS_NOTES_TEMPLATE.json"
    template_md = baseline_dir / "AUDIO_DEFECT_ATLAS_NOTES_TEMPLATE.md"
    write_json(template_json, template_payload)
    template_md.write_text(render_template_markdown(template_payload), encoding="utf-8")

    candidates: list[Candidate] = []
    packets: dict[str, dict[str, Any]] = {}
    ignored: list[dict[str, Any]] = []
    for path in iter_json_files(search_dirs):
        candidate, packet, error = classify_file(path, baseline_id, index)
        if candidate and packet:
            candidates.append(candidate)
            packets[str(candidate.path)] = packet
        elif error:
            ignored.append(error)

    selected = candidates[0] if candidates else None
    selected_packet = packets.get(str(selected.path)) if selected else None
    actions, unknown_rows = review_actions(selected, selected_packet, index)
    repair_count = sum(1 for action in actions if action["severity"] == "repair")
    proof_count = sum(1 for action in actions if action["severity"] == "proof")
    pass_count = sum(1 for action in actions if action["severity"] == "pass-context")
    status = selected.suggested_status if selected else "waiting-for-defect-atlas-notes"

    stable_json = baseline_dir / "AUDIO_DEFECT_ATLAS_NOTES_INBOX.json"
    stable_md = baseline_dir / "AUDIO_DEFECT_ATLAS_NOTES_INBOX.md"
    stable_html = baseline_dir / "AUDIO_DEFECT_ATLAS_NOTES_INBOX.html"
    stable_open = baseline_dir / "OPEN_AUDIO_DEFECT_ATLAS_NOTES_INBOX.command"
    versioned_dir = baseline_dir / f"audio-defect-atlas-notes-inbox-{slug}-{generated_at}"
    versioned_dir.mkdir(parents=True, exist_ok=True)
    versioned_json = versioned_dir / "audio-defect-atlas-notes-inbox.json"
    versioned_md = versioned_dir / "audio-defect-atlas-notes-inbox.md"
    versioned_html = versioned_dir / "audio-defect-atlas-notes-inbox.html"

    report = {
        "schema": "quipsly.audio-workbench.defect-atlas-notes-inbox.v1",
        "generatedAt": generated_iso,
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "status": status,
        "sourceAtlasPath": atlas_path,
        "searchDirs": [str(path) for path in search_dirs],
        "matchingCandidateCount": len(candidates),
        "matchingCandidates": [candidate_dict(candidate) for candidate in candidates],
        "selectedCandidate": candidate_dict(selected) if selected else None,
        "ignoredFiles": ignored[:80],
        "suggestedRoute": selected_route(selected),
        "reviewActions": actions,
        "unknownRows": unknown_rows,
        "repairActionCount": repair_count,
        "focusedProofActionCount": proof_count,
        "passContextCount": pass_count,
        "unknownItemCount": len(unknown_rows),
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
        "jsonPath": str(stable_json),
        "markdownPath": str(stable_md),
        "htmlPath": str(stable_html),
        "openCommand": str(stable_open),
        "versionedJsonPath": str(versioned_json),
        "versionedMarkdownPath": str(versioned_md),
        "versionedHtmlPath": str(versioned_html),
    }
    markdown = render_markdown(report)
    html_doc = render_html(report)
    for path in (stable_json, versioned_json):
        write_json(path, report)
    for path in (stable_md, versioned_md):
        path.write_text(markdown, encoding="utf-8")
    for path in (stable_html, versioned_html):
        path.write_text(html_doc, encoding="utf-8")
    write_open_command(stable_open, stable_html)
    update_manifest(manifest_path, report, {"jsonPath": str(template_json), "markdownPath": str(template_md)})
    print(json.dumps({"json": str(stable_json), "markdown": str(stable_md), "html": str(stable_html), "status": status, "matchingCandidateCount": len(candidates), "repairActionCount": repair_count, "focusedProofActionCount": proof_count, "passContextCount": pass_count}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
