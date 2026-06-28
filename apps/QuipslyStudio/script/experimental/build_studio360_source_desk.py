#!/usr/bin/env python3
"""Build a Studio360 Source Desk front door.

This is a local-only operator surface over Studio360 workflow, proxy prep,
reframe recipes, repair preflight, and repair decision status. It does not
transcode, repair, park, export, upload, publish, delete, overwrite, or mutate
source media.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360")
SCHEMA = "quipsly.studio360.source-desk.v1"
LATEST_POINTER = "latest-360-source-desk.json"
ALIAS_LATEST_POINTER = "latest-studio360-source-desk.json"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-360-source-desk")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def command(parts: list[Any]) -> str:
    return " ".join(shlex.quote(str(part)) for part in parts)


def open_command(path_value: Any) -> str:
    value = str(path_value or "")
    return command(["open", value]) if value else ""


def repair_command(group_key: str, action: str, dry_run: bool) -> str:
    if not group_key:
        return ""
    return command([
        "./script/agentctl.sh",
        "studio360-repair-decision-dry-run" if dry_run else "studio360-repair-decision",
        group_key,
        action,
        "codex",
        "<note>",
    ])


def load_packet(pointer: dict[str, Any]) -> dict[str, Any]:
    path = Path(str(pointer.get("jsonPath") or pointer.get("packetPath") or pointer.get("manifestPath") or ""))
    return load_json(path) if path.exists() else {}


def pointer_and_packet(root: Path, name: str) -> tuple[dict[str, Any], dict[str, Any]]:
    pointer = load_json(root / name)
    return pointer, load_packet(pointer)


def summarize_groups(workflow_packet: dict[str, Any], reframe_packet: dict[str, Any], repair_packet: dict[str, Any]) -> list[dict[str, Any]]:
    workflow_groups = {str(group.get("groupKey") or group.get("id") or ""): group for group in (workflow_packet.get("groups") or []) if isinstance(group, dict)}
    repair_tickets = {str(ticket.get("groupKey") or ticket.get("groupId") or ""): ticket for ticket in (repair_packet.get("tickets") or []) if isinstance(ticket, dict)}
    rows: list[dict[str, Any]] = []
    for group in reframe_packet.get("groups") or []:
        if not isinstance(group, dict):
            continue
        key = str(group.get("groupKey") or group.get("id") or "")
        workflow = workflow_groups.get(key, {})
        ticket = repair_tickets.get(key, {})
        review_source = group.get("reviewSource") if isinstance(group.get("reviewSource"), dict) else {}
        recipes = group.get("recipes") if isinstance(group.get("recipes"), list) else []
        status = str(group.get("reframeStatus") or workflow.get("status") or "needs-review")
        if status == "blocked-media-repair":
            next_action = ticket.get("nextSafestAction") or "Open repair preflight and inspect damaged source evidence before recopy/redownload or parking."
            priority = "repair"
        elif status == "blocked-needs-proxy":
            next_action = "Create or attach a managed proxy before reframing."
            priority = "proxy"
        elif status == "reframe-ready":
            next_action = "Open the reframe recipes and tune 16:9/9:16 framing/keyframes before export."
            priority = "ready"
        else:
            next_action = "Review workflow packet and decide whether this source needs proxy, repair, or parking."
            priority = "review"
        rows.append({
            "groupKey": key,
            "groupId": group.get("id") or workflow.get("id") or "",
            "priority": priority,
            "status": status,
            "workflowStatus": workflow.get("status") or "",
            "assetCount": group.get("assetCount") or workflow.get("assetCount") or 0,
            "durationSeconds": group.get("durationSeconds") or 0,
            "recipeCount": len(recipes),
            "damagedAssetCount": len(group.get("damagedAssets") or []) if isinstance(group.get("damagedAssets"), list) else ticket.get("assetCount") or 0,
            "reviewSourceKind": review_source.get("kind") or "",
            "reviewSourcePath": review_source.get("path") or "",
            "repairEvidencePresent": bool(ticket.get("repairEvidencePresent")),
            "firstSafeAction": ticket.get("firstSafeAction") if isinstance(ticket.get("firstSafeAction"), dict) else {},
            "safeLocalCommands": ticket.get("safeLocalCommands") if isinstance(ticket.get("safeLocalCommands"), list) else [],
            "dryRunCommands": {
                "previewNeedsSource": repair_command(key, "needs-source", True),
                "previewNeedsRedownload": repair_command(key, "needs-redownload", True),
                "previewUseCompanion": repair_command(key, "use-companion", True),
                "previewPark": repair_command(key, "park", True),
                "previewReview": repair_command(key, "review", True),
            },
            "executeCommandsAfterPreview": {
                "needsSource": repair_command(key, "needs-source", False),
                "needsRedownload": repair_command(key, "needs-redownload", False),
                "useCompanion": repair_command(key, "use-companion", False),
                "park": repair_command(key, "park", False),
                "review": repair_command(key, "review", False),
            },
            "nextSafestAction": next_action,
            "truth": "Group summary only. No proxy, repair decision, export, upload, publication, delete, overwrite, or source mutation occurred.",
        })
    priority_order = {"repair": 0, "proxy": 1, "review": 2, "ready": 3}
    return sorted(rows, key=lambda row: (priority_order.get(str(row.get("priority")), 9), str(row.get("groupKey"))))


def pointer_action(pointer: dict[str, Any], fallback_label: str) -> dict[str, Any]:
    action = pointer.get("firstSafeAction")
    if isinstance(action, dict) and action.get("command"):
        return action
    html_path = pointer.get("htmlPath") or ""
    return {
        "label": fallback_label,
        "command": open_command(html_path),
        "path": html_path,
        "safety": "Opens local Studio360 evidence only. No media, metadata, upload, publication, receipt, or account state changes.",
    }


def build_operator_runway(counts: dict[str, Any], pointers: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    proof_outputs = int(counts.get("proofOutputsPresent") or 0)
    ready_proofs = int(counts.get("readyToRunProofRows") or 0)
    ready_candidates = int(counts.get("exportCandidateRows") or 0)
    repair_blocks = int(counts.get("blockedMediaRepair") or 0)
    repair_tickets = int(counts.get("repairTickets") or 0)
    reframe_ready = int(counts.get("reframeReady") or 0)

    if proof_outputs:
        rows.append({
            "rank": 1,
            "lane": "proof-review",
            "status": "review-existing-proofs",
            "label": "Review existing 360 proof renders",
            "why": f"{proof_outputs} proof output(s) already exist. Reviewing them is safer than rendering more before we trust framing/audio.",
            "nextAction": "Open the Proof Review Desk, inspect 16:9 and 9:16 proof outputs, and record any framing/audio concerns before full renders.",
            "count": proof_outputs,
            "firstSafeAction": pointer_action(pointers.get("proofReview") or {}, "Open Studio360 Proof Review Desk"),
        })
    if ready_proofs and not proof_outputs:
        rows.append({
            "rank": len(rows) + 1,
            "lane": "proof-render",
            "status": "proof-render-ready",
            "label": "Run one local proof render",
            "why": f"{ready_proofs} proof row(s) are ready. Start with one proof, not a full render.",
            "nextAction": "Open the proof-next brief and run one proof command only after reviewing the dry-run evidence.",
            "count": ready_proofs,
            "firstSafeAction": pointer_action(pointers.get("proofNext") or {}, "Open Studio360 Proof Next Brief"),
        })
    if ready_candidates:
        rows.append({
            "rank": len(rows) + 1,
            "lane": "export-candidate",
            "status": "candidate-review-ready",
            "label": "Inspect export candidates",
            "why": f"{ready_candidates} export candidate row(s) exist, but candidate truth is not publication truth.",
            "nextAction": "Open candidate evidence and confirm the renderer path before any full export.",
            "count": ready_candidates,
            "firstSafeAction": pointer_action(pointers.get("exportQueue") or {}, "Open Studio360 Export Candidate Queue"),
        })
    if repair_blocks or repair_tickets:
        rows.append({
            "rank": len(rows) + 1,
            "lane": "source-repair",
            "status": "repair-blockers-visible",
            "label": "Resolve or park blocked source groups",
            "why": f"{repair_blocks} blocked media-repair group(s) and {repair_tickets} repair ticket(s) keep the whole 360 lane from being clean.",
            "nextAction": "Open repair preflight, inspect evidence, then record metadata-only needs-source/needs-redownload/use-companion/park decisions after human confirmation.",
            "count": repair_blocks or repair_tickets,
            "firstSafeAction": pointer_action(pointers.get("repairPreflight") or {}, "Open Studio360 Repair Preflight"),
        })
    if reframe_ready:
        rows.append({
            "rank": len(rows) + 1,
            "lane": "reframe",
            "status": "reframe-ready",
            "label": "Tune reframe recipes",
            "why": f"{reframe_ready} group(s) have enough source/proxy evidence for recipe review.",
            "nextAction": "Open the Reframe/Export Desk and tune 16:9/9:16 recipes without mutating source media.",
            "count": reframe_ready,
            "firstSafeAction": pointer_action(pointers.get("reframe") or {}, "Open Studio360 Reframe/Export Desk"),
        })
    if not rows:
        rows.append({
            "rank": 1,
            "lane": "bootstrap",
            "status": "needs-workflow-packets",
            "label": "Generate 360 workflow evidence",
            "why": "No proof, candidate, repair, or reframe evidence is visible yet.",
            "nextAction": "Regenerate the Studio360 workflow packet and source desk.",
            "count": 0,
            "firstSafeAction": {},
        })
    return rows


def build_packet(root: Path) -> dict[str, Any]:
    workflow_pointer, workflow_packet = pointer_and_packet(root, "latest-360-workflow-packet.json")
    reframe_pointer, reframe_packet = pointer_and_packet(root, "latest-360-reframe-packet.json")
    repair_pointer, repair_packet = pointer_and_packet(root, "latest-360-repair-preflight.json")
    repair_status_pointer, repair_status_packet = pointer_and_packet(root, "latest-360-repair-status.json")
    proxy_pointer, proxy_packet = pointer_and_packet(root, "latest-360-proxy-prep.json")
    proxy_failure_pointer, proxy_failure_packet = pointer_and_packet(root, "latest-360-proxy-prep-failure.json")
    export_queue_pointer, export_queue_packet = pointer_and_packet(root, "latest-360-export-candidate-queue.json")
    renderer_preflight_pointer, renderer_preflight_packet = pointer_and_packet(root, "latest-360-renderer-preflight.json")
    proof_next_pointer, proof_next_packet = pointer_and_packet(root, "latest-360-proof-next-brief.json")
    proof_review_pointer, proof_review_packet = pointer_and_packet(root, "latest-360-proof-review-desk.json")
    reframe_export_pointer, reframe_export_packet = pointer_and_packet(root, "latest-360-reframe-export-desk.json")
    next_source_pointer, next_source_packet = pointer_and_packet(root, "latest-360-next-source-card.json")

    workflow_counts = workflow_pointer.get("counts") if isinstance(workflow_pointer.get("counts"), dict) else {}
    reframe_counts = reframe_pointer.get("counts") if isinstance(reframe_pointer.get("counts"), dict) else {}
    repair_counts = repair_pointer.get("counts") if isinstance(repair_pointer.get("counts"), dict) else {}
    repair_status_counts = repair_status_pointer.get("counts") if isinstance(repair_status_pointer.get("counts"), dict) else {}
    export_queue_counts = export_queue_pointer.get("counts") if isinstance(export_queue_pointer.get("counts"), dict) else {}
    renderer_preflight_counts = renderer_preflight_pointer.get("counts") if isinstance(renderer_preflight_pointer.get("counts"), dict) else {}
    proof_next_counts = proof_next_pointer.get("counts") if isinstance(proof_next_pointer.get("counts"), dict) else {}
    proof_review_counts = proof_review_pointer.get("counts") if isinstance(proof_review_pointer.get("counts"), dict) else {}
    next_source_counts = next_source_pointer.get("counts") if isinstance(next_source_pointer.get("counts"), dict) else {}
    rows = summarize_groups(workflow_packet, reframe_packet, repair_packet)
    counts = {
        "assets": int(workflow_counts.get("assets") or 0),
        "groups": int(workflow_counts.get("groups") or reframe_counts.get("groups") or len(rows)),
        "reframeReady": int(reframe_counts.get("reframeReady") or sum(1 for row in rows if row.get("status") == "reframe-ready")),
        "blockedMediaRepair": int(reframe_counts.get("blockedMediaRepair") or repair_counts.get("blockedMediaRepair") or sum(1 for row in rows if row.get("status") == "blocked-media-repair")),
        "blockedNeedsProxy": int(reframe_counts.get("blockedNeedsProxy") or sum(1 for row in rows if row.get("status") == "blocked-needs-proxy")),
        "damagedAssets": int(reframe_counts.get("damagedAssets") or 0),
        "repairTickets": int(repair_counts.get("tickets") or 0),
        "repairDecisions": int(repair_status_counts.get("groupDecisionCount") or 0),
        "recipes": int(reframe_counts.get("recipes") or 0),
        "exportsCreated": int(reframe_counts.get("exportsCreated") or 0),
        "exportCandidateRows": int(export_queue_counts.get("candidateRows") or 0),
        "exportBlockedGroups": int(export_queue_counts.get("blockedGroups") or 0),
        "readyToRunProofRows": int(proof_next_counts.get("readyToRunProofRows") or renderer_preflight_counts.get("proofCommandsPrepared") or 0),
        "proofOutputsPresent": int(proof_review_counts.get("outputsPresent") or 0),
        "proofOutputsMissing": int(proof_review_counts.get("outputsMissing") or 0),
        "rendererDryRunReadyRows": int(renderer_preflight_counts.get("dryRunReadyRows") or 0),
        "nextSourceCardReady": bool(next_source_pointer.get("status") == "studio360-next-source-card-ready"),
        "nextSourceAssetCount": int(next_source_counts.get("assetCount") or 0),
        "nextSourcePaths": int(next_source_counts.get("sourcePaths") or 0),
        "nextSourceLocalProofCommandReady": bool(next_source_pointer.get("firstLocalProofCommand")),
        "nextSourceLocalProofOutputExists": bool(next_source_pointer.get("firstLocalProofOutputExists")),
        "nextSourceLocalProofReviewReady": bool(next_source_pointer.get("firstLocalProofReviewCommand")),
        "originalsMutated": False,
        "externalPublishing": False,
    }
    pointers = {
        "workflow": workflow_pointer,
        "reframe": reframe_export_pointer or reframe_pointer,
        "repairPreflight": repair_pointer,
        "repairStatus": repair_status_pointer,
        "exportQueue": export_queue_pointer,
        "rendererPreflight": renderer_preflight_pointer,
        "proofNext": proof_next_pointer,
        "proofReview": proof_review_pointer,
        "nextSource": next_source_pointer,
    }
    operator_runway = build_operator_runway(counts, pointers)
    if next_source_pointer.get("status") == "studio360-next-source-card-ready":
        operator_runway.insert(0, {
            "rank": 0,
            "lane": "source-inspection",
            "status": "next-source-card-ready",
            "label": "Inspect one 360 source card",
            "why": f"{next_source_pointer.get('label') or 'One proxy-safe source group'} is the smallest safe 360 step: confirm source intent, proxy/companion evidence, and reframe readiness before any render.",
            "nextAction": next_source_pointer.get("nextSafestAction") or "Open one source card and confirm whether this group is safe for proof/reframe review.",
            "count": int(next_source_counts.get("assetCount") or 1),
            "firstSafeAction": pointer_action(next_source_pointer, "Open this 360 source card"),
            "firstLocalProofCommand": next_source_pointer.get("firstLocalProofCommand") or "",
            "firstLocalProofCandidateId": next_source_pointer.get("firstLocalProofCandidateId") or "",
            "firstLocalProofAspect": next_source_pointer.get("firstLocalProofAspect") or "",
            "firstLocalProofOutputPath": next_source_pointer.get("firstLocalProofOutputPath") or "",
            "firstLocalProofOutputExists": bool(next_source_pointer.get("firstLocalProofOutputExists")),
            "firstLocalProofReviewCommand": next_source_pointer.get("firstLocalProofReviewCommand") or "",
            "firstLocalProofSafety": next_source_pointer.get("firstLocalProofSafety") or "Local proof command only. Do not run without explicit approval for this proof.",
        })
    if counts["proofOutputsPresent"]:
        next_action = "Review existing 360 proof outputs first, then resolve repair blockers before claiming the full 360 lane is clean."
    elif counts["readyToRunProofRows"]:
        next_action = "Run one local 360 proof render, inspect it, then continue only after proof review."
    elif counts["blockedMediaRepair"]:
        next_action = "Open the Source Desk, inspect blocked repair tickets first, then recopy/redownload or park sources only after human confirmation."
    elif counts["blockedNeedsProxy"]:
        next_action = "Create managed proxies for blocked groups before reframing."
    else:
        next_action = "Open reframe-ready groups and tune 16:9/9:16 recipes before any export."
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "studio360Root": str(root),
        "status": "source-desk-ready" if workflow_pointer or reframe_pointer else "needs-360-workflow-packet",
        "truth": "Studio360 Source Desk only. It summarizes workflow/proxy/reframe/repair evidence without transcoding, repairing, parking, exporting, uploading, publishing, deleting, overwriting, or mutating originals.",
        "counts": counts,
        "sourcePointers": {
            "workflowHtml": workflow_pointer.get("htmlPath") or "",
            "workflowJson": workflow_pointer.get("jsonPath") or workflow_pointer.get("packetPath") or "",
            "reframeHtml": reframe_pointer.get("htmlPath") or "",
            "reframeJson": reframe_pointer.get("jsonPath") or "",
            "repairPreflightHtml": repair_pointer.get("htmlPath") or "",
            "repairPreflightJson": repair_pointer.get("jsonPath") or "",
            "repairStatusHtml": repair_status_pointer.get("htmlPath") or "",
            "repairStatusJson": repair_status_pointer.get("jsonPath") or "",
            "proxyPrepManifest": proxy_pointer.get("manifestPath") or "",
            "proxyPath": proxy_pointer.get("proxyPath") or "",
            "proxyFailureManifest": proxy_failure_pointer.get("manifestPath") or "",
            "proxyFailureSourcePath": proxy_failure_pointer.get("sourcePath") or "",
            "proxyFailureError": proxy_failure_pointer.get("error") or "",
            "exportQueueHtml": export_queue_pointer.get("htmlPath") or "",
            "exportQueueJson": export_queue_pointer.get("jsonPath") or "",
            "rendererPreflightHtml": renderer_preflight_pointer.get("htmlPath") or "",
            "rendererPreflightJson": renderer_preflight_pointer.get("jsonPath") or "",
            "proofNextHtml": proof_next_pointer.get("htmlPath") or "",
            "proofNextJson": proof_next_pointer.get("jsonPath") or "",
            "proofReviewHtml": proof_review_pointer.get("htmlPath") or "",
            "proofReviewJson": proof_review_pointer.get("jsonPath") or "",
            "reframeExportDeskHtml": reframe_export_pointer.get("htmlPath") or "",
            "reframeExportDeskJson": reframe_export_pointer.get("jsonPath") or "",
            "nextSourceHtml": next_source_pointer.get("htmlPath") or "",
            "nextSourceJson": next_source_pointer.get("jsonPath") or "",
        },
        "operatorRunway": operator_runway,
        "groupRows": rows[:80],
        "firstSafeAction": (operator_runway[0].get("firstSafeAction") if operator_runway else {}) or repair_pointer.get("firstSafeAction") or reframe_pointer.get("firstSafeAction") or workflow_pointer.get("firstSafeAction") or {},
        "nextSafestAction": next_action,
        "safety": {
            "originalsMutated": False,
            "exportsCreated": False,
            "externalPublishing": False,
            "repairDecisionsWritten": False,
            "sourceDeletes": False,
            "versionOverwrites": False,
        },
    }


def prepare_output_dir(root: Path) -> Path:
    out_dir = root / "SourceDesk" / stamp()
    base = out_dir
    counter = 2
    while out_dir.exists():
        out_dir = Path(f"{base}-{counter}")
        counter += 1
    out_dir.mkdir(parents=True, exist_ok=False)
    return out_dir


def write_csv(path: Path, packet: dict[str, Any]) -> None:
    fields = ["groupKey", "priority", "status", "workflowStatus", "assetCount", "durationSeconds", "recipeCount", "damagedAssetCount", "reviewSourceKind", "reviewSourcePath", "nextSafestAction", "previewParkCommand", "previewReviewCommand", "executeParkCommand"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in packet.get("groupRows") or []:
            dry_run_commands = row.get("dryRunCommands") if isinstance(row.get("dryRunCommands"), dict) else {}
            execute_commands = row.get("executeCommandsAfterPreview") if isinstance(row.get("executeCommandsAfterPreview"), dict) else {}
            csv_row = {field: row.get(field, "") for field in fields}
            csv_row["previewParkCommand"] = dry_run_commands.get("previewPark") or ""
            csv_row["previewReviewCommand"] = dry_run_commands.get("previewReview") or ""
            csv_row["executeParkCommand"] = execute_commands.get("park") or ""
            writer.writerow(csv_row)


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    counts = packet.get("counts") or {}
    lines = [
        "# Studio360 Source Desk",
        "",
        f"Generated: `{packet.get('generatedAt')}`",
        "",
        str(packet.get("truth") or ""),
        "",
        "## Counts",
        "",
    ]
    for key in ["assets", "groups", "reframeReady", "blockedMediaRepair", "blockedNeedsProxy", "damagedAssets", "repairTickets", "repairDecisions", "recipes", "exportCandidateRows", "readyToRunProofRows", "proofOutputsPresent", "proofOutputsMissing", "exportsCreated"]:
        lines.append(f"- `{key}`: `{counts.get(key, 0)}`")
    lines.extend(["", "## Next safest action", "", str(packet.get("nextSafestAction") or ""), "", "## Operator runway", ""])
    for row in packet.get("operatorRunway") or []:
        action = row.get("firstSafeAction") if isinstance(row.get("firstSafeAction"), dict) else {}
        lines.extend([
            f"### {row.get('rank')}. {row.get('label')}",
            f"- Lane: `{row.get('lane')}`",
            f"- Status: `{row.get('status')}`",
            f"- Why: {row.get('why')}",
            f"- Next: {row.get('nextAction')}",
            f"- Safe open command: `{action.get('command') or ''}`",
            f"- Local proof output exists: `{row.get('firstLocalProofOutputExists') or False}`",
            f"- Local proof review command: `{row.get('firstLocalProofReviewCommand') or ''}`",
            f"- Local proof command: `{row.get('firstLocalProofCommand') or ''}`",
            f"- Local proof safety: {row.get('firstLocalProofSafety') or ''}",
            "",
        ])
    lines.extend(["", "## Source packets", ""])
    for key, value in (packet.get("sourcePointers") or {}).items():
        lines.append(f"- `{key}`: `{value}`")
    lines.extend(["", "## Priority groups", ""])
    for row in (packet.get("groupRows") or [])[:24]:
        lines.extend([
            f"### {row.get('groupKey')} - {row.get('status')}",
            f"- Priority: `{row.get('priority')}`",
            f"- Assets: `{row.get('assetCount')}`; recipes: `{row.get('recipeCount')}`; damaged: `{row.get('damagedAssetCount')}`",
            f"- Review source: `{row.get('reviewSourceKind')}` `{row.get('reviewSourcePath')}`",
            f"- Next: {row.get('nextSafestAction')}",
            f"- Dry-run park command: `{(row.get('dryRunCommands') or {}).get('previewPark') or ''}`",
            f"- Execute park command after preview: `{(row.get('executeCommandsAfterPreview') or {}).get('park') or ''}`",
            "",
        ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(path: Path, packet: dict[str, Any]) -> None:
    counts = packet.get("counts") or {}
    runway_html = []
    for row in packet.get("operatorRunway") or []:
        action = row.get("firstSafeAction") if isinstance(row.get("firstSafeAction"), dict) else {}
        runway_html.append(f"""
        <article class="runway-card">
          <div class="topline"><span>{esc(row.get('lane'))}</span><strong>Step {esc(row.get('rank'))}</strong></div>
          <h3>{esc(row.get('label'))}</h3>
          <p>{esc(row.get('why'))}</p>
          <p><strong>Next:</strong> {esc(row.get('nextAction'))}</p>
          <div class="stats"><span>{esc(row.get('status'))}</span><span>{esc(row.get('count'))} item(s)</span></div>
          <details open><summary>First safe action</summary><pre>{esc(json.dumps(action, indent=2))}</pre></details>
          {f'<details open><summary>Review existing local proof</summary><pre>{esc(row.get("firstLocalProofReviewCommand"))}</pre><p>{esc(row.get("firstLocalProofSafety"))}</p></details>' if row.get("firstLocalProofReviewCommand") else ''}
          {f'<details open><summary>Local proof command - not executed here</summary><pre>{esc(row.get("firstLocalProofCommand"))}</pre><p>{esc(row.get("firstLocalProofSafety"))}</p></details>' if row.get("firstLocalProofCommand") else ''}
        </article>
        """)
    rows_html = []
    for row in packet.get("groupRows") or []:
        priority = str(row.get("priority") or "review")
        rows_html.append(f"""
        <article class="group {esc(priority)}">
          <div class="topline"><span>{esc(priority)}</span><strong>{esc(row.get('groupKey'))}</strong></div>
          <h3>{esc(row.get('status'))}</h3>
          <p>{esc(row.get('nextSafestAction'))}</p>
          <div class="stats"><span>{esc(row.get('assetCount'))} assets</span><span>{esc(row.get('recipeCount'))} recipes</span><span>{esc(row.get('damagedAssetCount'))} damaged</span><span>{esc(round(float(row.get('durationSeconds') or 0), 1))}s</span></div>
          <details open><summary>Dry-run repair decisions first</summary><pre>{esc(json.dumps(row.get('dryRunCommands') or {}, indent=2))}</pre></details>
          <details><summary>Execute metadata-only decision after preview</summary><pre>{esc(json.dumps(row.get('executeCommandsAfterPreview') or {}, indent=2))}</pre></details>
          <details><summary>Source and commands</summary><pre>{esc(json.dumps(row, indent=2))}</pre></details>
        </article>
        """)
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Studio360 Source Desk</title>
  <style>
    :root {{ color-scheme:dark; --bg:#0f1712; --panel:#1a251d; --ink:#fff0d4; --muted:#d1c19e; --moss:#8ebb72; --gold:#ebca59; --water:#79c7d4; --clay:#c97855; --line:rgba(255,240,212,.15); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; color:var(--ink); font-family:Avenir Next, Helvetica Neue, sans-serif; background:radial-gradient(circle at 10% -8%, rgba(121,199,212,.18), transparent 34%), radial-gradient(circle at 90% 0%, rgba(142,187,114,.18), transparent 32%), linear-gradient(180deg,#111b14,#070b08); }}
    header {{ padding:46px clamp(20px,5vw,82px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.24em; font-size:12px; font-weight:950; }}
    h1 {{ max-width:1080px; margin:10px 0; font-size:clamp(42px,7vw,86px); line-height:.92; }}
    p {{ color:var(--muted); line-height:1.45; }}
    header p {{ max-width:960px; font-size:18px; }}
    .summary,.stats {{ display:flex; gap:9px; flex-wrap:wrap; margin-top:18px; }}
    .summary span,.stats span {{ border:1px solid var(--line); border-radius:999px; padding:8px 11px; background:rgba(255,255,255,.055); color:var(--ink); font-weight:850; }}
    main {{ padding:28px clamp(16px,4vw,58px) 72px; display:grid; gap:20px; }}
    section {{ border:1px solid var(--line); border-radius:28px; padding:22px; background:linear-gradient(180deg,rgba(26,37,29,.95),rgba(8,13,9,.98)); box-shadow:0 18px 46px rgba(0,0,0,.2); }}
    h2 {{ margin:0 0 14px; color:var(--gold); }}
    .groups {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:14px; }}
    .group {{ border:1px solid var(--line); border-radius:18px; padding:14px; background:rgba(0,0,0,.18); }}
    .runway-card {{ border:1px solid rgba(121,199,212,.36); border-radius:20px; padding:16px; background:linear-gradient(180deg,rgba(121,199,212,.08),rgba(0,0,0,.2)); }}
    .group.repair {{ border-color:rgba(201,120,85,.58); }}
    .group.ready {{ border-color:rgba(142,187,114,.45); }}
    .topline {{ display:flex; justify-content:space-between; gap:12px; color:var(--gold); text-transform:uppercase; letter-spacing:.12em; font-size:11px; font-weight:950; }}
    h3 {{ margin:9px 0 5px; }}
    summary {{ cursor:pointer; color:var(--water); font-weight:850; }}
    pre {{ white-space:pre-wrap; overflow-wrap:anywhere; color:var(--muted); background:rgba(0,0,0,.25); border-radius:12px; padding:10px; }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Studio360 Source Desk</div>
    <h1>Keep the sphere whole. Route the repair work clearly.</h1>
    <p>{esc(packet.get('truth'))}</p>
    <p><strong>Next safest action:</strong> {esc(packet.get('nextSafestAction'))}</p>
    <div class="summary">
      <span>{esc(counts.get('assets'))} assets</span>
      <span>{esc(counts.get('groups'))} groups</span>
      <span>{esc(counts.get('reframeReady'))} reframe-ready</span>
      <span>{esc(counts.get('blockedMediaRepair'))} repair blocks</span>
      <span>{esc(counts.get('damagedAssets'))} damaged assets</span>
      <span>{esc(counts.get('repairDecisions'))} repair decisions</span>
      <span>{esc(counts.get('proofOutputsPresent'))} proof outputs</span>
      <span>{esc(counts.get('exportCandidateRows'))} export candidates</span>
    </div>
  </header>
  <main>
    <section><h2>Operator runway</h2><p>Review-ready proof evidence and repair blockers can both be true. This ladder keeps them separate so we make progress without lying to ourselves.</p><div class="groups">{''.join(runway_html) or '<p>No operator runway rows yet.</p>'}</div></section>
    <section><h2>Priority groups</h2><div class="groups">{''.join(rows_html) or '<p>No 360 group rows yet. Generate workflow and reframe packets.</p>'}</div></section>
    <section><h2>Source packet paths</h2><pre>{esc(json.dumps(packet.get('sourcePointers') or {}, indent=2))}</pre></section>
  </main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def update_pointer(root: Path, out_dir: Path, packet: dict[str, Any], html_path: Path, json_path: Path, markdown_path: Path, csv_path: Path) -> None:
    pointer = {
        "schema": "quipsly.studio360.latest-source-desk.v1",
        "updatedAt": iso_now(),
        "status": packet.get("status") or "source-desk-ready",
        "humanAsk": "Open the Studio360 Source Desk and choose whether each priority group needs proof review, proxy work, repair evidence, parking, or reframe tuning.",
        "agentSafeParallelWork": "Codex may summarize 360 evidence, improve routing packets, prepare dry-run repair decisions, and clarify proof/reframe next steps. Do not render, repair, park, upload, publish, delete, overwrite, mutate originals, or create receipts without explicit approval.",
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "sessionDir": str(out_dir),
        "counts": packet.get("counts") or {},
        "truth": packet.get("truth") or "",
        "nextSafestAction": packet.get("nextSafestAction") or "Open Studio360 evidence before proxy/reframe/export work.",
        "firstSafeAction": packet.get("firstSafeAction") or {},
        "operatorRunway": packet.get("operatorRunway") or [],
        "sourcePointers": packet.get("sourcePointers") or {},
        "originalsMutated": False,
        "exportsCreated": False,
        "externalPublishing": False,
        "repairDecisionsWritten": False,
    }
    write_json(root / LATEST_POINTER, pointer)
    write_json(root / ALIAS_LATEST_POINTER, pointer)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a local-only Studio360 Source Desk.")
    parser.add_argument("studio360_root", nargs="?", default=str(DEFAULT_ROOT))
    args = parser.parse_args()
    root = Path(args.studio360_root)
    packet = build_packet(root)
    out_dir = prepare_output_dir(root)
    json_path = out_dir / "360-source-desk.json"
    html_path = out_dir / "index.html"
    markdown_path = out_dir / "START-HERE-360-source-desk.md"
    csv_path = out_dir / "360-source-desk.csv"
    packet["operatorFirstSafeAction"] = packet.get("firstSafeAction") or {}
    packet["firstSafeAction"] = {
        "label": "Open Studio360 Source Desk",
        "path": str(html_path),
        "command": open_command(str(html_path)),
        "safety": "Opens the local Studio360 source desk first. No render, export, repair, park, upload, publish, delete, overwrite, account mutation, receipt truth, or original-media mutation occurs.",
    }
    packet.update({
        "sessionDir": str(out_dir),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
    })
    write_json(json_path, packet)
    write_markdown(markdown_path, packet)
    write_csv(csv_path, packet)
    write_html(html_path, packet)
    update_pointer(root, out_dir, packet, html_path, json_path, markdown_path, csv_path)
    print(json.dumps({
        "status": "ok",
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "counts": packet.get("counts"),
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
